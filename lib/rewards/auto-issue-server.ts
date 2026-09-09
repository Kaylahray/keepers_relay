import * as ccc from '@ckb-ccc/core';
import {
  network,
  profileType,
  REGISTRY_FEE_RATE,
  rewardClaimType,
  rpcUrl,
  usernameType,
} from '@/lib/registry/config';
import { computeMinCellCapacityCore } from '@/lib/registry/capacity-core';
import {
  decodeProfile,
  decodeUsername,
  isValidUsername,
} from '@/lib/registry/encoding';
import type { Profile } from '@/lib/registry/types';
import {
  decodeRewardClaimData,
  encodeRewardClaimData,
  rewardEventHash,
} from '@/lib/rewards/claim-data';
import {
  isProfileCompleted,
  REWARD_POINTS,
  type RewardMilestone,
} from '@/lib/rewards/milestones';

let cachedClient: ccc.Client | null = null;

export function getServerCkbClient(): ccc.Client {
  if (cachedClient) return cachedClient;
  if (network === 'mainnet') {
    cachedClient = new ccc.ClientPublicMainnet({ url: rpcUrl });
  } else {
    cachedClient = new ccc.ClientPublicTestnet({ url: rpcUrl });
  }
  return cachedClient;
}

function scriptFromConfig(cfg: {
  codeHash: string;
  hashType: 'type' | 'data' | 'data1' | 'data2';
  args: string;
}): ccc.Script {
  return ccc.Script.from({
    codeHash: cfg.codeHash,
    hashType: cfg.hashType,
    args: cfg.args,
  });
}

function cellDepFromConfig(cfg: {
  outPoint: { txHash: string; index: string };
  depType: 'code' | 'depGroup';
}): ccc.CellDep {
  return ccc.CellDep.from({
    outPoint: {
      txHash: cfg.outPoint.txHash,
      index: cfg.outPoint.index,
    },
    depType: cfg.depType,
  });
}

function normalizeHash(hex: string): string {
  const t = hex.trim().toLowerCase();
  return t.startsWith('0x') ? t : `0x${t}`;
}

export async function serverFindUsernameForOwnerLock(
  client: ccc.Client,
  ownerLock: ccc.Script,
): Promise<string | null> {
  const type = scriptFromConfig(usernameType);
  for await (const cell of client.findCells(
    {
      script: type,
      scriptType: 'type',
      scriptSearchMode: 'exact',
      filter: { script: ownerLock },
    },
    'asc',
    40,
  )) {
    try {
      const username = decodeUsername(
        new Uint8Array(ccc.bytesFrom(cell.outputData)),
      );
      if (isValidUsername(username)) return username;
    } catch {
      continue;
    }
  }
  return null;
}

export async function serverFindLatestProfileForOwnerLock(
  client: ccc.Client,
  ownerLock: ccc.Script,
): Promise<Profile | null> {
  const type = scriptFromConfig(profileType);
  let latest: Profile | null = null;
  for await (const cell of client.findCells(
    {
      script: type,
      scriptType: 'type',
      scriptSearchMode: 'exact',
      filter: { script: ownerLock },
    },
    'asc',
    40,
  )) {
    const data = new Uint8Array(ccc.bytesFrom(cell.outputData));
    const decoded = decodeProfile(data);
    if (decoded) latest = decoded;
  }
  return latest;
}

export async function serverRecipientHasOpenClaimForEvent(
  client: ccc.Client,
  recipientLockHash: string,
  event: RewardMilestone,
): Promise<boolean> {
  const claimType = scriptFromConfig(rewardClaimType);
  const target = normalizeHash(rewardEventHash(event));
  const rh = normalizeHash(recipientLockHash);
  for await (const cell of client.findCells(
    {
      script: claimType,
      scriptType: 'type',
      scriptSearchMode: 'exact',
    },
    'asc',
    400,
  )) {
    try {
      const decoded = decodeRewardClaimData(
        new Uint8Array(ccc.bytesFrom(cell.outputData)),
      );
      if (
        normalizeHash(decoded.recipientLockHash) === rh &&
        normalizeHash(decoded.eventIdHash) === target
      ) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

export async function serverSubmitCreateClaimTicket(params: {
  signer: ccc.Signer;
  recipientLock: ccc.Script;
  event: RewardMilestone;
  amount: bigint;
}): Promise<string> {
  const { signer, recipientLock, event, amount } = params;

  const nonce = new Uint8Array(16);
  crypto.getRandomValues(nonce);

  const claimData = encodeRewardClaimData({
    recipientLockHash: recipientLock.hash(),
    amount,
    event,
    nonce,
  });

  const claimType = scriptFromConfig(rewardClaimType);
  const capacity = computeMinCellCapacityCore(
    recipientLock,
    claimType,
    claimData,
  );

  const tx = ccc.Transaction.from({
    inputs: [],
    outputs: [
      ccc.CellOutput.from({
        lock: recipientLock,
        type: claimType,
        capacity,
      }),
    ],
    outputsData: [ccc.hexFrom(claimData)],
    cellDeps: [cellDepFromConfig(rewardClaimType)],
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  return signer.sendTransaction(tx);
}

export function parseIssuerPrivateKey(): `0x${string}` | null {
  const raw = process.env.REWARD_AUTO_ISSUER_PRIVATE_KEY?.trim();
  if (!raw) return null;
  const with0x = raw.startsWith('0x') ? raw : `0x${raw}`;
  if (with0x.length < 66) return null;
  return with0x as `0x${string}`;
}

export async function serverAutoIssueRewardTickets(params: {
  recipientCkbAddress: string;
  requestedMilestones: RewardMilestone[];
}): Promise<{
  issued: RewardMilestone[];
  skipped: string[];
  txHashes: string[];
}> {
  const key = parseIssuerPrivateKey();
  if (!key) {
    return {
      issued: [],
      skipped: ['REWARD_AUTO_ISSUER_PRIVATE_KEY is not set on the server.'],
      txHashes: [],
    };
  }

  const client = getServerCkbClient();
  const signer = new ccc.SignerCkbPrivateKey(client, key);

  const recipient = await ccc.Address.fromString(
    params.recipientCkbAddress.trim(),
    client,
  );
  const recipientLock = recipient.script;
  const recipientLockHash = recipientLock.hash();

  const issued: RewardMilestone[] = [];
  const skipped: string[] = [];
  const txHashes: string[] = [];

  const unique = [...new Set(params.requestedMilestones)];

  for (const milestone of unique) {
    const username = await serverFindUsernameForOwnerLock(
      client,
      recipientLock,
    );
    const profile = await serverFindLatestProfileForOwnerLock(
      client,
      recipientLock,
    );

    if (milestone === 'username_claimed') {
      if (!username) {
        skipped.push('username_claimed: no on-chain username for this lock.');
        continue;
      }
    } else if (milestone === 'profile_completed') {
      if (!username) {
        skipped.push(
          'profile_completed: username must exist before this milestone.',
        );
        continue;
      }
      if (!isProfileCompleted(profile ?? null)) {
        skipped.push(
          'profile_completed: profile is not complete on-chain (name, headline, avatar spore).',
        );
        continue;
      }
    }

    const has = await serverRecipientHasOpenClaimForEvent(
      client,
      recipientLockHash,
      milestone,
    );
    if (has) {
      skipped.push(`${milestone}: open claim ticket already exists.`);
      continue;
    }

    const amount = BigInt(REWARD_POINTS[milestone]);
    const txHash = await serverSubmitCreateClaimTicket({
      signer,
      recipientLock,
      event: milestone,
      amount,
    });
    txHashes.push(txHash);
    issued.push(milestone);
  }

  return { issued, skipped, txHashes };
}
