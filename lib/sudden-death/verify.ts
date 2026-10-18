import { ccc } from '@ckb-ccc/core';
import { suddenDeathMatchType } from '@/lib/registry/config';
import {
  ckbHash,
  decodeMatchCell,
  hexToBytes,
  bytesToHex,
  shrinkMs,
  shrunkDeadline,
  type MatchCell,
} from '@/lib/sudden-death/codec';

/**
 * An independent replay of a match, straight from chain.
 *
 * Nothing in this file talks to our server, our database or our lobby API. It takes one
 * transaction hash, finds the match behind it, walks the whole chain of steals, and re-checks
 * every rule `match-type` enforces — the Merkle proof, the round, the pot, the clock, and the
 * fields that are supposed to be immutable.
 *
 * The point is that a sceptic can run it. If this file and the script ever disagree, the script
 * wins and we have a bug worth knowing about.
 */

const TAG_LEAF = 0x00;
const TAG_NODE = 0x01;
const PROOF_VERSION = 1;
const PROOF_HEADER = 70;

export type StealProof = {
  version: number;
  questionIndex: number;
  correct: number;
  optionCount: number;
  siblings: Uint8Array[];
  promptHash: Uint8Array;
  salt: Uint8Array;
};

/** Reverse of `stealProof` in the codec. The script reads the same bytes in the same order. */
export function decodeStealProof(raw: Uint8Array): StealProof | null {
  if (raw.length < PROOF_HEADER) return null;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const pathLength = raw[5]!;
  if (raw.length !== PROOF_HEADER + pathLength * 32) return null;
  if (pathLength > 6) return null;
  const siblings: Uint8Array[] = [];
  for (let i = 0; i < pathLength; i += 1) {
    siblings.push(raw.slice(PROOF_HEADER + i * 32, PROOF_HEADER + i * 32 + 32));
  }
  return {
    version: raw[0]!,
    questionIndex: view.getUint16(1, true),
    correct: raw[3]!,
    optionCount: raw[4]!,
    promptHash: raw.slice(6, 38),
    salt: raw.slice(38, 70),
    siblings,
  };
}

/**
 * Rebuild the Merkle root the proof claims to reach.
 *
 * The proof carries the hash of the question text rather than the text itself, so this verifies
 * without ever learning what was asked. That is the whole trick: the bank stays secret and the
 * win stays checkable.
 */
export function rootFromProof(matchId: Uint8Array, proof: StealProof): Uint8Array {
  const index = new Uint8Array(2);
  new DataView(index.buffer).setUint16(0, proof.questionIndex, true);
  let node = ckbHash([
    Uint8Array.of(TAG_LEAF),
    matchId,
    index,
    proof.promptHash,
    Uint8Array.of(proof.correct, proof.optionCount),
    proof.salt,
  ]);
  let position = proof.questionIndex;
  for (const sibling of proof.siblings) {
    node =
      (position & 1) === 0
        ? ckbHash([Uint8Array.of(TAG_NODE), node, sibling])
        : ckbHash([Uint8Array.of(TAG_NODE), sibling, node]);
    position >>= 1;
  }
  return node;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
  return true;
}

export type StealCheck = {
  txHash: string;
  /** Round written by this steal. */
  round: number;
  questionIndex: number;
  correct: number;
  potAfter: bigint;
  deadlineBefore: number;
  deadlineAfter: number;
  cutMs: number;
  kingAfter: string;
  /** The Merkle path reaches the root committed when the match opened. */
  proofOk: boolean;
  /** Round advanced by exactly one. */
  roundOk: boolean;
  /** Pot grew by exactly the entry fee. */
  potOk: boolean;
  /** Deadline is exactly `shrunk_deadline(previous, round)`. */
  clockOk: boolean;
  /** Root, fee, treasury and bid code never changed. */
  immutableOk: boolean;
  ok: boolean;
};

export type MatchReplay = {
  matchId: string;
  hostLockHash: string;
  openTxHash: string;
  openedDeadline: number;
  fee: bigint;
  root: string;
  steals: StealCheck[];
  live: boolean;
  finalRound: number;
  finalPot: bigint;
  finalKing: string;
  finalDeadline: number;
  /** Every rule held on every steal. */
  ok: boolean;
};

function matchTypeOf(matchId: string, hostLockHash: string): ccc.Script {
  return ccc.Script.from({
    codeHash: suddenDeathMatchType.codeHash,
    hashType: suddenDeathMatchType.hashType,
    args: `0x${matchId.replace(/^0x/, '')}${hostLockHash.replace(/^0x/, '')}`,
  });
}

function isMatchType(script: ccc.Script | undefined): boolean {
  if (!script) return false;
  return (
    script.codeHash.toLowerCase() === suddenDeathMatchType.codeHash.toLowerCase() &&
    script.hashType === suddenDeathMatchType.hashType &&
    ccc.bytesFrom(script.args).length === 64
  );
}

/** Index of the match cell among a transaction's outputs, or -1. */
function matchOutputIndex(tx: ccc.Transaction): number {
  return tx.outputs.findIndex((output) => isMatchType(output.type));
}

export class VerifyError extends Error {}

/** `getTransaction` hands back a status wrapper; the walk only wants the transaction itself. */
async function loadTx(client: ccc.Client, hash: string): Promise<ccc.Transaction | null> {
  const response = await client.getTransaction(hash);
  return response?.transaction ?? null;
}

/**
 * Walk a match back to the transaction that opened it.
 *
 * Every steal spends the previous match cell as input 0, so the history is a straight chain and
 * no indexer is needed to follow it — just the transactions themselves.
 */
export async function replayMatch(client: ccc.Client, startTxHash: string): Promise<MatchReplay> {
  if (suddenDeathMatchType.codeHash.length <= 2) {
    throw new VerifyError('This build has no Sudden Death match script configured.');
  }
  const hash = startTxHash.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) {
    throw new VerifyError('Paste a 32-byte transaction hash, starting with 0x.');
  }

  const start = await loadTx(client, hash);
  if (!start) throw new VerifyError('That transaction is not on this network.');

  // Find the match cell this transaction touches — as an output (open or steal), or as an
  // input (the close, which consumes the match and produces none).
  let anchorTx = start;
  let anchorIndex = matchOutputIndex(start);
  if (anchorIndex < 0) {
    let found: ccc.OutPoint | null = null;
    for (const input of start.inputs) {
      const cell = await client.getCell(input.previousOutput);
      if (cell && isMatchType(cell.cellOutput.type)) {
        found = input.previousOutput;
        break;
      }
    }
    if (!found) throw new VerifyError('No Sudden Death match cell appears in that transaction.');
    const previous = await loadTx(client, found.txHash);
    if (!previous) throw new VerifyError('The match cell this transaction spent is unreadable.');
    anchorTx = previous;
    anchorIndex = matchOutputIndex(previous);
    if (anchorIndex < 0) throw new VerifyError('The match cell this transaction spent is unreadable.');
  }

  const args = ccc.bytesFrom(anchorTx.outputs[anchorIndex]!.type!.args);
  const matchId = bytesToHex(args.slice(0, 32));
  const hostLockHash = bytesToHex(args.slice(32, 64));
  const typeScript = matchTypeOf(matchId, hostLockHash);
  const typeHash = typeScript.hash().toLowerCase();

  // If the match is still live, its newest cell is the true tip. Start the walk there so the
  // replay covers the present, not just whatever transaction happened to be pasted in.
  let live = false;
  let tipTx = anchorTx;
  let tipIndex = anchorIndex;
  for await (const cell of client.findCells(
    { script: typeScript, scriptType: 'type', scriptSearchMode: 'exact', withData: true },
    'desc',
    1,
  )) {
    const tipHash = cell.outPoint.txHash;
    const found = await loadTx(client, tipHash);
    const index = found ? matchOutputIndex(found) : -1;
    if (found && index >= 0) {
      live = true;
      tipTx = found;
      tipIndex = index;
    }
    break;
  }

  // Walk backwards. Each hop is one steal; the hop that runs out is the open.
  type Hop = { tx: ccc.Transaction; index: number; previous: ccc.Cell | null };
  const hops: Hop[] = [];
  let cursor: { tx: ccc.Transaction; index: number } | null = { tx: tipTx, index: tipIndex };
  const seen = new Set<string>();
  while (cursor) {
    const key = cursor.tx.hash();
    if (seen.has(key)) throw new VerifyError('This match history loops, which should be impossible.');
    seen.add(key);
    if (hops.length > 128) throw new VerifyError('This match has more rounds than the verifier will walk.');

    const first = cursor.tx.inputs[0];
    // `getCell` reads a cell out of the transaction that created it, which is exactly what a
    // historical lookup wants: these cells are all long spent.
    const previous = first ? (await client.getCell(first.previousOutput)) ?? null : null;
    const isSteal = Boolean(previous && previous.cellOutput.type?.hash().toLowerCase() === typeHash);
    hops.push({ tx: cursor.tx, index: cursor.index, previous: isSteal ? previous : null });
    if (!isSteal) break;
    const previousTx = await loadTx(client, first!.previousOutput.txHash);
    const previousIndex = previousTx ? matchOutputIndex(previousTx) : -1;
    cursor = previousTx && previousIndex >= 0 ? { tx: previousTx, index: previousIndex } : null;
  }

  hops.reverse();
  const open = hops[0];
  if (!open) throw new VerifyError('Could not find the transaction that opened this match.');

  const opened = decodeMatchCell(hexToBytes(open.tx.outputsData[open.index]!));
  const rootBytes = opened.root;
  const matchIdBytes = hexToBytes(matchId);

  const steals: StealCheck[] = [];
  let previousState: MatchCell = opened;

  for (const hop of hops.slice(1)) {
    const state = decodeMatchCell(hexToBytes(hop.tx.outputsData[hop.index]!));
    const before = previousState;

    const witness = hop.tx.getWitnessArgsAt(0)?.inputType;
    const proof = witness ? decodeStealProof(new Uint8Array(ccc.bytesFrom(witness))) : null;
    const proofOk = Boolean(
      proof &&
        proof.version === PROOF_VERSION &&
        sameBytes(rootFromProof(matchIdBytes, proof), rootBytes),
    );

    const roundOk = state.round === before.round + 1;
    const potOk = state.pot === before.pot + before.fee;
    const expectedDeadline = shrunkDeadline(Number(before.deadlineMs), before.round);
    const clockOk = Number(state.deadlineMs) === expectedDeadline;
    const immutableOk =
      sameBytes(state.root, before.root) &&
      state.fee === before.fee &&
      sameBytes(state.treasury, before.treasury) &&
      sameBytes(state.bidCode, before.bidCode);

    steals.push({
      txHash: hop.tx.hash(),
      round: state.round,
      questionIndex: proof?.questionIndex ?? -1,
      correct: proof?.correct ?? -1,
      potAfter: state.pot,
      deadlineBefore: Number(before.deadlineMs),
      deadlineAfter: Number(state.deadlineMs),
      cutMs: shrinkMs(before.round),
      kingAfter: bytesToHex(state.king),
      proofOk,
      roundOk,
      potOk,
      clockOk,
      immutableOk,
      ok: proofOk && roundOk && potOk && clockOk && immutableOk,
    });
    previousState = state;
  }

  return {
    matchId,
    hostLockHash,
    openTxHash: open.tx.hash(),
    openedDeadline: Number(opened.deadlineMs),
    fee: opened.fee,
    root: bytesToHex(rootBytes),
    steals,
    live,
    finalRound: previousState.round,
    finalPot: previousState.pot,
    finalKing: bytesToHex(previousState.king),
    finalDeadline: Number(previousState.deadlineMs),
    ok: steals.every((steal) => steal.ok),
  };
}
