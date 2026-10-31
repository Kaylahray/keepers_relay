import { ccc } from '@ckb-ccc/core';
import { fire, isPass, newDuel, type ArtilleryState, type ShotRecord } from '@/lib/duel/artillery';
import { duelScript } from '@/lib/duel/chain';
import {
  decodeDuel,
  duelSeed,
  duelWind,
  KIND_ARTILLERY,
  KIND_RACE,
  STATUS_LIVE,
  type DuelCell,
  type DuelKind,
} from '@/lib/duel/codec';
import { duelType } from '@/lib/registry/config';
import type { LaneRunner } from '@/lib/game/lane-runner';
import { bytesToHex, hexToBytes, lapsFromWitness, MAX_TX_FEE, runSeed } from '@/lib/sudden-death/codec';

/** An independent replay of a duel, straight from chain. */

export class DuelVerifyError extends Error {}

/** One block, as a reader can look it up. */
export type BlockRef = { hash: string; number: bigint; ms: number };

/** One move of an artillery duel as the chain recorded it. */
export type DuelMove = {
  /** 0-based turn number. Even turns are the challenger's. */
  turn: number;
  side: 0 | 1;
  /** A turn its player let run out, passed by someone else. */
  pass: boolean;
  angle: number;
  power: number;
  /** The wind the shell flew in: from the block the duel last landed in. */
  wind: number;
  /** That wind is the one the block before gives. */
  windOk: boolean;
  /** Damage the shot did to [challenger, opponent], replayed here. */
  damage: [number, number];
  /** The transaction that recorded the move, and the block it landed in. */
  txHash: string;
  block: BlockRef;
};

/** One rule, said plainly, and whether this duel kept it. */
export type DuelRule = { ok: boolean; text: string };

/** A racer's run, from the transaction that handed it in. */
export type RaceRun = {
  side: 0 | 1;
  score: bigint;
  /** What the run scores when replayed here, or null if it could not be replayed. */
  replayed: number | null;
  /** Each lap's road seed and recorded lane changes, for playing the run back. */
  laps: { seed: bigint; tape: Uint8Array }[];
  txHash: string;
};

export type DuelReplay = {
  duelId: string;
  kind: DuelKind;
  stake: bigint;
  challenger: string;
  opponent: string;
  status: 'open' | 'cancelled' | 'live' | 'finished';
  openTx: string;
  accept: { txHash: string; block: BlockRef } | null;
  /** Artillery: the battlefield's seed, every move as played, and the board at the end. */
  seed: number | null;
  shots: ShotRecord[];
  moves: DuelMove[];
  board: ArtilleryState | null;
  /** Race: each player's handed-in run. */
  runs: RaceRun[];
  /** Who the game itself says won; null while it is still on. */
  winner: 0 | 1 | 'draw' | null;
  /** The payout: who each output paid, by lock hash. */
  payout: { txHash: string; block: BlockRef | null; paid: { lockHash: string; ckb: bigint }[] } | null;
  rules: DuelRule[];
  ok: boolean;
};

function isDuelCell(type: ccc.Script | undefined): boolean {
  return Boolean(
    type &&
      type.codeHash.toLowerCase() === duelType.codeHash.toLowerCase() &&
      type.hashType === duelType.hashType &&
      ccc.bytesFrom(type.args).length === 32,
  );
}

async function blockOf(client: ccc.Client, txHash: string): Promise<BlockRef | null> {
  const found = await client.getTransaction(txHash);
  const header = found?.blockHash ? await client.getHeaderByHash(found.blockHash) : undefined;
  return found?.blockHash && header ? { hash: found.blockHash, number: BigInt(header.number), ms: Number(header.timestamp) } : null;
}

/** The duel a transaction touches, as an output or as a spent input; null if none. */
export async function duelIdOf(client: ccc.Client, txHash: string): Promise<string | null> {
  if (duelType.codeHash.length <= 2) return null;
  const tx = (await client.getTransaction(txHash))?.transaction;
  if (!tx) return null;
  const output = tx.outputs.find((out) => isDuelCell(out.type));
  if (output?.type) return output.type.args.toLowerCase();
  for (const input of tx.inputs) {
    const cell = await client.getCell(input.previousOutput);
    if (cell && isDuelCell(cell.cellOutput.type)) return cell.cellOutput.type!.args.toLowerCase();
  }
  return null;
}

/** Every state the duel cell has been in, oldest first, and the transaction that ended it (if any). */
async function history(client: ccc.Client, duelId: string) {
  const order: string[] = [];
  const outputAt = new Map<string, number>();
  for await (const item of client.findTransactionsByType(duelScript(duelId), false, 'asc', 400)) {
    if (!order.includes(item.txHash)) order.push(item.txHash);
    if (!item.isInput) outputAt.set(item.txHash, Number(item.cellIndex));
  }
  const states: { txHash: string; tx: ccc.Transaction; duel: DuelCell; capacity: bigint; block: BlockRef }[] = [];
  let end: ccc.Transaction | null = null;
  // Every transaction and its block, fetched together rather than one after another.
  const loaded = await Promise.all(
    order.map(async (txHash) => {
      const found = await client.getTransaction(txHash);
      const header = found?.blockHash ? await client.getHeaderByHash(found.blockHash) : undefined;
      const block: BlockRef | null =
        found?.blockHash && header ? { hash: found.blockHash, number: BigInt(header.number), ms: Number(header.timestamp) } : null;
      return { txHash, tx: found?.transaction ?? null, block };
    }),
  );
  for (const { txHash, tx, block } of loaded) {
    if (!tx) continue;
    const index = outputAt.get(txHash);
    if (index === undefined) {
      end = tx;
      continue;
    }
    if (!block) continue;
    states.push({ txHash, tx, duel: decodeDuel(hexToBytes(tx.outputsData[index]!)), capacity: BigInt(tx.outputs[index]!.capacity), block });
  }
  return { states, end };
}

/** Replays a duel from chain alone. `game` replays race runs; artillery needs nothing loaded. */
export async function replayDuel(client: ccc.Client, txHash: string, game: LaneRunner | null): Promise<DuelReplay> {
  const hash = txHash.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) throw new DuelVerifyError('Paste a 32-byte transaction hash, starting with 0x.');
  const duelId = await duelIdOf(client, hash);
  if (!duelId) throw new DuelVerifyError('No duel appears in that transaction.');
  const id = hexToBytes(duelId);
  const { states, end } = await history(client, duelId);
  const opened = states[0];
  if (!opened) throw new DuelVerifyError('Could not find the transaction that opened this duel.');
  const last = states.at(-1)!;
  const acceptIndex = states.findIndex((state) => state.duel.status === STATUS_LIVE);
  const accepted = acceptIndex >= 0 ? states[acceptIndex]! : null;
  const stake = opened.duel.stake;
  const challenger = bytesToHex(opened.duel.challenger);
  const opponent = accepted ? bytesToHex(accepted.duel.opponent) : bytesToHex(opened.duel.opponent);
  const status: DuelReplay['status'] = !end ? (accepted ? 'live' : 'open') : accepted ? 'finished' : 'cancelled';
  const rules: DuelRule[] = [];

  if (accepted) {
    const bothIn = accepted.capacity - opened.capacity === stake;
    rules.push({ ok: bothIn, text: `Both players put in ${ckb(stake)} CKB, so ${ckb(stake * 2n)} CKB was at stake.` });
  }

  // Artillery: every move, from the state that recorded it.
  const moves: DuelMove[] = [];
  let seed: number | null = null;
  let shots: ShotRecord[] = [];
  let board: ArtilleryState | null = null;
  if (opened.duel.kind === KIND_ARTILLERY && accepted && last.duel.shots.length > 0) {
    const seedBlock = last.duel.seedBlock;
    const seedOk = bytesToHex(seedBlock).toLowerCase() === accepted.block.hash.toLowerCase();
    seed = duelSeed(id, seedBlock);
    rules.push({ ok: seedOk, text: `The battlefield came from block #${accepted.block.number}, the block the challenge was accepted in.` });
    shots = last.duel.shots;
    let state = newDuel(seed);
    for (let i = acceptIndex + 1; i < states.length; i += 1) {
      const before = states[i - 1]!;
      const here = states[i]!;
      for (let turn = before.duel.shots.length; turn < here.duel.shots.length; turn += 1) {
        const recorded = here.duel.shots[turn]!;
        const pass = isPass(recorded);
        const result = state.winner === null ? fire(state, recorded, recorded.wind) : null;
        if (result) state = result.next;
        moves.push({
          turn,
          side: (turn % 2) as 0 | 1,
          pass,
          angle: recorded.angle,
          power: recorded.power,
          wind: recorded.wind,
          windOk: pass || recorded.wind === duelWind(id, hexToBytes(before.block.hash)),
          damage: result?.damage ?? [0, 0],
          txHash: here.txHash,
          block: here.block,
        });
      }
    }
    board = state;
    const shotsOnly = moves.filter((move) => !move.pass);
    rules.push({
      ok: shotsOnly.every((move) => move.windOk),
      text: `Every shot flew in the wind of the block the duel last landed in (${shotsOnly.length} shots).`,
    });
    const skipped = moves.filter((move) => move.pass).length;
    if (skipped > 0) rules.push({ ok: true, text: `${skipped} ${skipped === 1 ? 'turn was' : 'turns were'} skipped after the player's time ran out. Nobody was paid for it.` });
  }

  // Race: each player's run, from the transaction that handed it in.
  const runs: RaceRun[] = [];
  if (opened.duel.kind === KIND_RACE && accepted) {
    for (let i = acceptIndex + 1; i < states.length; i += 1) {
      const before = states[i - 1]!.duel;
      const here = states[i]!;
      const side = (here.duel.submitted & ~before.submitted & 0b01 ? 0 : 1) as 0 | 1;
      const witness = here.tx.getWitnessArgsAt(0)?.inputType;
      const laps = witness ? lapsFromWitness(new Uint8Array(ccc.bytesFrom(witness))) : null;
      const owner = side === 0 ? challenger : opponent;
      const seeded = (laps ?? []).map((lap) => ({ seed: runSeed(duelId, owner, lap.block), tape: lap.tape }));
      const replayed = game && laps ? game.replayLaps(seeded) : null;
      runs.push({ side, score: here.duel.scores[side], replayed, laps: seeded, txHash: here.txHash });
    }
    for (const run of runs) {
      rules.push({
        ok: run.replayed === Number(run.score),
        text: `${run.side === 0 ? 'The challenger' : 'The opponent'}'s run was replayed here: ${run.replayed ?? '?'} points, as recorded.`,
      });
    }
  }

  // Who the game says won.
  let winner: DuelReplay['winner'] = null;
  if (board) winner = board.winner;
  if (opened.duel.kind === KIND_RACE && end) {
    const score = (side: 0 | 1) => (last.duel.submitted & (1 << side) ? last.duel.scores[side] : 0n);
    winner = score(0) === score(1) ? 'draw' : score(0) > score(1) ? 0 : 1;
  }

  // The payout, and whether it went where the game says.
  let payout: DuelReplay['payout'] = null;
  if (end && accepted) {
    const paid = end.outputs.map((output) => ({ lockHash: output.lock.hash().toLowerCase(), ckb: BigInt(output.capacity) }));
    const to = (lockHash: string) => paid.filter((out) => out.lockHash === lockHash.toLowerCase()).reduce((sum, out) => sum + out.ckb, 0n);
    payout = { txHash: end.hash(), block: await blockOf(client, end.hash()), paid };
    const total = last.capacity;
    const winnerLock = winner === 0 ? challenger : winner === 1 ? opponent : null;
    const paidOk =
      winner === 'draw'
        ? to(opponent) >= stake && to(challenger) >= total - stake - MAX_TX_FEE
        : winner === 1
          ? to(opponent) >= stake * 2n
          : winner === 0
            ? to(challenger) >= total - MAX_TX_FEE
            : false;
    rules.push({
      ok: paidOk,
      text:
        winner === 'draw'
          ? `CKB replayed the duel: a draw. Each player got their ${ckb(stake)} CKB back.`
          : winnerLock
            ? `CKB replayed the duel before paying, and the winner was paid both stakes (${ckb(stake * 2n)} CKB).`
            : 'The payout does not match a finished game.',
    });
  }

  return {
    duelId,
    kind: opened.duel.kind,
    stake,
    challenger,
    opponent,
    status,
    openTx: opened.txHash,
    accept: accepted ? { txHash: accepted.txHash, block: accepted.block } : null,
    seed,
    shots,
    moves,
    board,
    runs,
    winner,
    payout,
    rules,
    ok: rules.every((rule) => rule.ok),
  };
}

function ckb(shannons: bigint): string {
  return (Number(shannons) / 1e8).toLocaleString('en-US', { maximumFractionDigits: 2 });
}
