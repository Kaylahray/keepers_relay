import { ccc } from '@ckb-ccc/core';
import { suddenDeathGame, suddenDeathMatchType } from '@/lib/registry/config';
import type { LaneRunner } from '@/lib/game/lane-runner';
import {
  decodeMatchCell,
  hexToBytes,
  bytesToHex,
  certifiedAfter,
  landBy,
  landByV4,
  runSeed,
  runSeedV1,
  shrinkMs,
  shrunkDeadline,
  decodeEntryRun,
  lapsFromWitness,
  tapeFromWitness,
  winnerOf,
  type MatchCell,
} from '@/lib/sudden-death/codec';

/**
 * An independent replay of a match, straight from chain.
 *
 * Nothing in this file talks to our server, our database or our lobby API. It takes one
 * transaction hash, finds the match behind it, walks the whole chain of steals, and re-checks
 * every rule `match-type` enforces. It replays each winning run itself, in the browser's build of
 * the game, on the course of the player it crowned, and checks the round, the pot, the clock, and
 * the fields that are supposed to be immutable.
 *
 * The point is that a sceptic can run it. If this file and the script ever disagree, the script
 * wins and we have a bug worth knowing about.
 */

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
  return true;
}

export type StealCheck = {
  txHash: string;
  /** Round written by this steal. */
  round: number;
  potAfter: bigint;
  deadlineBefore: number;
  deadlineAfter: number;
  cutMs: number;
  kingAfter: string;
  /** Score this steal wrote into the match cell. */
  score: number;
  /** What the run in the witness scores when replayed here, or null if it could not be replayed. */
  replayed: number | null;
  /** Lane changes in the run. */
  moves: number;
  /** The run as recorded: each lap's road seed and lane changes, to play it back. Null if unreadable. */
  run: { laps: { seed: bigint; tape: Uint8Array }[]; whole?: boolean } | null;
  /** Replayed score equals the recorded one, beats the crown before it, and crowned someone new. */
  runOk: boolean;
  /** Round advanced by exactly one. */
  roundOk: boolean;
  /** Pot grew by exactly the entry fee. */
  potOk: boolean;
  /** Deadline is exactly `shrunk_deadline(previous, round)`. */
  clockOk: boolean;
  /** Game, fee, treasury and bid code never changed. */
  immutableOk: boolean;
  /** When this steal landed: its block's timestamp. Null if the block could not be read. */
  landedAt: number | null;
  /** v3: whether it landed by the deadline running when it was sent. Only on-time steals can win. */
  onTime: boolean | null;
  /** v3: the certified king it records is the one the postmark rule gives. */
  certifyOk: boolean;
  ok: boolean;
};

export type MatchReplay = {
  matchId: string;
  hostLockHash: string;
  openTxHash: string;
  openedDeadline: number;
  fee: bigint;
  /** Data hash of the game script the match names. */
  game: string;
  /** Whether this page has that game, and so can replay the runs. */
  gameKnown: boolean;
  steals: StealCheck[];
  live: boolean;
  finalRound: number;
  finalPot: bigint;
  finalKing: string;
  finalScore: number;
  finalDeadline: number;
  /** v3 crowns: who the pot goes to at the close (or would, if closed now). Null: the host gets it all back. */
  winner: string | null;
  /** Whether the match runs on the v3 rules, where late steals land but never win. */
  postmarked: boolean;
  /** Every rule held on every steal. */
  ok: boolean;
};

/**
 * Every match-type script Crowns has deployed on testnet, newest first. Each upgrade was a fresh
 * deployment with its own type id, so a crown played on an older version carries that version's
 * code hash. The verifier reads them all: an old crown's record is still on chain.
 */
const MATCH_CODE_HASHES = [
  suddenDeathMatchType.codeHash,
  '0xfc9bfc29b98557d1edc2612a16631c16cc79b6d60c84ce78f48d9c41a7f9b834', // v4
  '0xbb388fcce8ceef841e98a614f49281032fd66ae57f20aecbc6167ad766b0813f', // v2
  '0x1b24a657634dd36d359105c4ce15c13b545f48996864d06108dfb48d68979339', // v1
].map((hash) => hash.toLowerCase());

function matchTypeOf(codeHash: string, matchId: string, hostLockHash: string): ccc.Script {
  return ccc.Script.from({
    codeHash,
    hashType: suddenDeathMatchType.hashType,
    args: `0x${matchId.replace(/^0x/, '')}${hostLockHash.replace(/^0x/, '')}`,
  });
}

function isMatchType(script: ccc.Script | undefined): boolean {
  if (!script) return false;
  return (
    MATCH_CODE_HASHES.includes(script.codeHash.toLowerCase()) &&
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

/** When a transaction landed: the timestamp of its block, in ms. */
async function landedAt(client: ccc.Client, hash: string): Promise<bigint | null> {
  return (await blockOf(client, hash))?.ms ?? null;
}

/** The block a transaction landed in: its hash and timestamp. */
async function blockOf(client: ccc.Client, hash: string): Promise<{ hash: string; ms: bigint } | null> {
  const blockHash = (await client.getTransaction(hash))?.blockHash;
  const header = blockHash ? await client.getHeaderByHash(blockHash) : undefined;
  return blockHash && header ? { hash: blockHash, ms: BigInt(header.timestamp) } : null;
}

/** The run sealed into the entry a steal spent, and when that entry landed (its last seal). */
async function entryRunOf(client: ccc.Client, tx: ccc.Transaction, bidCode: Uint8Array) {
  const bidCodeHex = bytesToHex(bidCode).toLowerCase();
  for (const input of tx.inputs.slice(1)) {
    const cell = await client.getCell(input.previousOutput);
    if (cell?.cellOutput.type?.codeHash.toLowerCase() === bidCodeHex) {
      const landedMs = await landedAt(client, input.previousOutput.txHash);
      return { ...decodeEntryRun(new Uint8Array(ccc.bytesFrom(cell.outputData))), landedMs };
    }
  }
  return null;
}

/**
 * Walk a match back to the transaction that opened it.
 *
 * Every steal spends the previous match cell as input 0, so the history is a straight chain and
 * no indexer is needed to follow it — just the transactions themselves.
 */
export async function replayMatch(client: ccc.Client, startTxHash: string, game: LaneRunner): Promise<MatchReplay> {
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
  const typeScript = matchTypeOf(anchorTx.outputs[anchorIndex]!.type!.codeHash, matchId, hostLockHash);
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
  const gameHex = bytesToHex(opened.game);
  const gameKnown = gameHex.toLowerCase() === suddenDeathGame.codeHash.toLowerCase();

  const steals: StealCheck[] = [];
  let previousState: MatchCell = opened;
  // Every match cell's postmark: the time its transaction landed.
  const landed = await Promise.all(hops.map((hop) => landedAt(client, hop.tx.hash()).catch(() => null)));
  const postmarked = opened.version >= 4;

  for (const [step, hop] of hops.slice(1).entries()) {
    const state = decodeMatchCell(hexToBytes(hop.tx.outputsData[hop.index]!));
    const before = previousState;

    // The run is scored on the course of the player it crowned, exactly as the script does.
    const witness = hop.tx.getWitnessArgsAt(0)?.inputType;
    const rawWitness = witness ? new Uint8Array(ccc.bytesFrom(witness)) : null;
    const score = Number(state.kingScore);
    // Since v4 a run is played in laps, each on the road seeded by the block it was sealed against.
    const laps = postmarked && rawWitness ? lapsFromWitness(rawWitness) : null;
    const tape = !postmarked && rawWitness ? tapeFromWitness(rawWitness) : null;
    const entry = postmarked ? await entryRunOf(client, hop.tx, before.bidCode).catch(() => null) : null;
    const run = laps
      ? { laps: laps.map((lap) => ({ seed: runSeed(matchId, state.king, lap.block), tape: lap.tape })) }
      : tape
        ? { laps: [{ seed: runSeedV1(matchId, state.king), tape }], whole: true }
        : null;
    let replayed: number | null = null;
    if (gameKnown && laps && run) {
      replayed = game.replayLaps(run.laps);
    } else if (gameKnown && tape) {
      replayed = game.replay(runSeedV1(matchId, state.king), tape);
    }
    const runOk =
      replayed === score && score > Number(before.kingScore) && !sameBytes(state.king, before.king);

    const roundOk = state.round === before.round + 1;
    const potOk = state.pot === before.pot + before.fee;
    const expectedDeadline = shrunkDeadline(Number(before.deadlineMs), before.round);
    const clockOk = Number(state.deadlineMs) === expectedDeadline;
    const immutableOk =
      sameBytes(state.game, before.game) &&
      state.fee === before.fee &&
      sameBytes(state.treasury, before.treasury) &&
      sameBytes(state.bidCode, before.bidCode);

    // The postmark rule. This steal spent a cell that landed at `landed[step]`, which decides whether
    // the king before it is certified; its own cell landed at `landed[step + 1]`.
    const landedHere = landed[step + 1] ?? null;
    const landedBefore = landed[step] ?? null;
    const onTime = postmarked && landedHere != null ? landedHere <= state.landByMs : null;
    let certifyOk = true;
    if (postmarked) {
      const expected = landedBefore == null ? null : certifiedAfter(before, landedBefore);
      certifyOk =
        expected != null &&
        entry != null &&
        // v5 counts from the entry's last seal; v4 counted from the entry itself.
        (opened.version >= 5
          ? entry.landedMs != null && state.landByMs === landBy(before.deadlineMs, entry.landedMs)
          : state.landByMs === landByV4(before.deadlineMs, entry.lapStartMs)) &&
        sameBytes(state.certified, expected.king) &&
        state.certifiedScore === expected.score;
    }

    steals.push({
      txHash: hop.tx.hash(),
      round: state.round,
      potAfter: state.pot,
      deadlineBefore: Number(before.deadlineMs),
      deadlineAfter: Number(state.deadlineMs),
      cutMs: shrinkMs(before.round),
      kingAfter: bytesToHex(state.king),
      score,
      replayed,
      moves: laps ? laps.reduce((sum, lap) => sum + Math.floor(lap.tape.length / 3), 0) : tape ? Math.floor(tape.length / 3) : 0,
      run: gameKnown ? run : null,
      runOk,
      roundOk,
      potOk,
      clockOk,
      immutableOk,
      landedAt: landedHere == null ? null : Number(landedHere),
      onTime,
      certifyOk,
      ok: runOk && roundOk && potOk && clockOk && immutableOk && certifyOk,
    });
    previousState = state;
  }

  return {
    matchId,
    hostLockHash,
    openTxHash: open.tx.hash(),
    openedDeadline: Number(opened.deadlineMs),
    fee: opened.fee,
    game: gameHex,
    gameKnown,
    steals,
    live,
    finalRound: previousState.round,
    finalPot: previousState.pot,
    finalKing: bytesToHex(previousState.king),
    finalScore: Number(previousState.kingScore),
    finalDeadline: Number(previousState.deadlineMs),
    winner: (() => {
      const tipLanded = landed[landed.length - 1];
      if (!postmarked || tipLanded == null) return null;
      const won = winnerOf(previousState, tipLanded);
      return won ? bytesToHex(won) : null;
    })(),
    postmarked,
    ok: steals.every((steal) => steal.ok),
  };
}
