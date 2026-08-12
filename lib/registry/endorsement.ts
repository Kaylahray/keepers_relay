'use client';

import { ccc } from '@ckb-ccc/connector-react';
import { REGISTRY_FEE_RATE } from './config';
import { computeMinCapacityNoType } from './capacity';
import { getClient } from './client';
import { getUsernameOwnerLock, type Signer } from './username';
import { normalizeUsername } from './encoding';

const MAGIC = 'KR_ENDORSE1';
const NOTE_MAX = 120;

export type OnChainEndorsement = {
  subjectUsername: string;
  endorserUsername: string;
  endorserLockHash: string;
  note: string;
  at: number;
  cellOutpoint: { txHash: string; index: string };
  capacityCkb: string;
};

type EndorsementPayload = {
  v: 1;
  s: string;
  e: string;
  h: string;
  n: string;
  t: number;
};

function encodeEndorsement(payload: EndorsementPayload): Uint8Array {
  return new TextEncoder().encode(`${MAGIC}${JSON.stringify(payload)}`);
}

function decodeEndorsement(raw: Uint8Array): EndorsementPayload | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(raw);
    if (!text.startsWith(MAGIC)) return null;
    const parsed = JSON.parse(text.slice(MAGIC.length)) as Partial<EndorsementPayload>;
    if (parsed.v !== 1) return null;
    if (typeof parsed.s !== 'string' || typeof parsed.e !== 'string') return null;
    if (typeof parsed.h !== 'string' || typeof parsed.t !== 'number') return null;
    return {
      v: 1,
      s: normalizeUsername(parsed.s),
      e: normalizeUsername(parsed.e),
      h: parsed.h,
      n: typeof parsed.n === 'string' ? parsed.n.slice(0, NOTE_MAX) : '',
      t: parsed.t,
    };
  } catch {
    return null;
  }
}

async function getOwnerLock(signer: NonNullable<Signer>): Promise<ccc.Script> {
  const addr = await signer.getRecommendedAddressObj();
  return addr.script;
}

export async function listEndorsementsForUsername(
  usernameRaw: string,
): Promise<OnChainEndorsement[]> {
  const username = normalizeUsername(usernameRaw);
  const ownerLock = await getUsernameOwnerLock(username);
  if (!ownerLock) return [];

  const client = getClient();
  const found: OnChainEndorsement[] = [];

  for await (const cell of client.findCells(
    {
      script: ownerLock,
      scriptType: 'lock',
      scriptSearchMode: 'exact',
    },
    'desc',
    120,
  )) {
    // Skip typed cells (username, profile, spore, etc.)
    if (cell.cellOutput.type) continue;
    const payload = decodeEndorsement(new Uint8Array(ccc.bytesFrom(cell.outputData)));
    if (!payload) continue;
    if (payload.s !== username) continue;

    found.push({
      subjectUsername: payload.s,
      endorserUsername: payload.e,
      endorserLockHash: payload.h,
      note: payload.n,
      at: payload.t,
      cellOutpoint: {
        txHash: cell.outPoint.txHash,
        index: cell.outPoint.index.toString(),
      },
      capacityCkb: (Number(cell.cellOutput.capacity) / 100_000_000).toFixed(2),
    });
  }

  return found;
}

export async function endorseUser(params: {
  signer: NonNullable<Signer>;
  subjectUsername: string;
  endorserUsername: string;
  note?: string;
}): Promise<OnChainEndorsement> {
  const subjectUsername = normalizeUsername(params.subjectUsername);
  const endorserUsername = normalizeUsername(params.endorserUsername);
  const note = (params.note ?? '').trim().slice(0, NOTE_MAX);

  if (!subjectUsername || !endorserUsername) {
    throw new Error('Both handles are required to endorse.');
  }
  if (subjectUsername === endorserUsername) {
    throw new Error('You cannot endorse yourself.');
  }

  const subjectLock = await getUsernameOwnerLock(subjectUsername);
  if (!subjectLock) {
    throw new Error(`@${subjectUsername} is not claimed on-chain yet.`);
  }

  const myLock = await getOwnerLock(params.signer);
  const myLockHash = myLock.hash();
  if (subjectLock.hash() === myLockHash) {
    throw new Error('You cannot endorse your own profile.');
  }

  const existing = await listEndorsementsForUsername(subjectUsername);
  if (existing.some((item) => item.endorserLockHash === myLockHash)) {
    throw new Error(`You already endorsed @${subjectUsername} on-chain.`);
  }

  const payload: EndorsementPayload = {
    v: 1,
    s: subjectUsername,
    e: endorserUsername,
    h: myLockHash,
    n: note,
    t: Date.now(),
  };
  const data = encodeEndorsement(payload);
  const capacity = computeMinCapacityNoType(subjectLock, data);

  const tx = ccc.Transaction.from({
    outputs: [{ lock: subjectLock, capacity }],
    outputsData: [ccc.hexFrom(data)],
  });

  await tx.completeInputsByCapacity(params.signer);
  await tx.completeFeeBy(params.signer, REGISTRY_FEE_RATE);
  const txHash = await params.signer.sendTransaction(tx);
  await params.signer.client.waitTransaction(txHash);

  return {
    subjectUsername,
    endorserUsername,
    endorserLockHash: myLockHash,
    note,
    at: payload.t,
    cellOutpoint: { txHash, index: '0x0' },
    capacityCkb: (Number(capacity) / 100_000_000).toFixed(2),
  };
}

export function estimateEndorsementCapacityCkb(note = ''): number {
  const payload: EndorsementPayload = {
    v: 1,
    s: 'abcdefghijkl',
    e: 'abcdefghijkl',
    h: `0x${'ab'.repeat(32)}`,
    n: note.slice(0, NOTE_MAX),
    t: Date.now(),
  };
  const dataBytes = encodeEndorsement(payload).length;
  // Approximate lock (54) + capacity field (8) + data
  return 8 + 54 + dataBytes;
}
