import { ccc } from '@ckb-ccc/core';
import { decodeMatch, decodeSeat, FEE } from '@/lib/rally/chain';
import { liveMatch } from '@/lib/registry/config';
import { playsByTheseRules, recordOf, replayRecord } from '@/lib/rally/result';
import type { RallyRunner } from '@/lib/rally/rules';

/**
 * Crown Rally's history, read from the chain: every finish of a live-match. No database: a finish
 * spends the match cell and its seats, carries the race record, and pays out, so the transaction
 * itself says who raced and who took the pot.
 *
 * Who won is read from the payouts: each wallet's share of the pot is what it was paid, less its
 * storage deposits (and, in finishes from before signed moves, its key cell coming home). A winner
 * takes more than they put in; in a refund, everyone gets just their entry back.
 */

/** Shannons cross as decimal strings, so the stats survive JSON. */
export type RaceResult = {
  txHash: string;
  matchId: string;
  endedMs: number | null;
  map: number;
  /** The data hash of the game the match named: whose rules decided it. */
  game: string;
  entry: string;
  pot: string;
  /** Each car's wallet lock hash, host first. */
  players: string[];
  /** Each winner's wallet lock hash and the share of the pot it took. Empty for a refund. */
  winners: { owner: string; share: string }[];
  /** Crown shards each car picked up, as the replay counts them; null for a race on older rules. */
  shards: number[] | null;
};

export type PlayerTally = { played: number; wins: number; won: string; shards: number };

export type RallyStats = {
  /** Newest first. */
  races: RaceResult[];
  /** By wallet lock hash, lower case. */
  players: Record<string, PlayerTally>;
  readAt: number;
};

function isLiveMatch(script: ccc.Script | undefined): script is ccc.Script {
  return Boolean(script && script.codeHash === liveMatch.codeHash && script.hashType === liveMatch.hashType);
}

/** One finish, or null for any other live-match transaction (an open, a join, a close, a send-home). */
export async function raceOf(client: ccc.Client, txHash: string, runner?: RallyRunner): Promise<RaceResult | null> {
  const found = await client.getTransaction(txHash);
  if (!found || found.status !== 'committed') return null;
  const tx = found.transaction;
  const inputs = await Promise.all(tx.inputs.map((input) => client.getCell(input.previousOutput)));
  const at = inputs.findIndex((cell) => isLiveMatch(cell?.cellOutput.type) && ccc.bytesFrom(cell!.cellOutput.type!.args).length === 32);
  if (at < 0 || !tx.getWitnessArgs(at)?.inputType) return null;
  const matchCell = inputs[at]!;
  const match = decodeMatch(ccc.bytesFrom(matchCell.outputData));
  if (!match) return null;

  // The cars: the host, then each seat in the order it was spent.
  const cars = [{ owner: match.host.toLowerCase(), key: match.hostKey.toLowerCase(), capacity: matchCell.cellOutput.capacity }];
  for (const cell of inputs) {
    if (!cell || cell === matchCell || !isLiveMatch(cell.cellOutput.type)) continue;
    const seat = decodeSeat(ccc.bytesFrom(cell.outputData));
    if (seat) cars.push({ owner: seat.owner.toLowerCase(), key: seat.key.toLowerCase(), capacity: cell.cellOutput.capacity });
  }
  const keyOwner = new Map(cars.map((car) => [car.key, car.owner]));
  const keyCells = new Map<string, bigint>();
  for (const cell of inputs) {
    const owner = cell ? keyOwner.get(cell.cellOutput.lock.hash().toLowerCase()) : undefined;
    if (cell && owner) keyCells.set(owner, (keyCells.get(owner) ?? 0n) + cell.cellOutput.capacity);
  }

  // The shards come from replaying the race, with the rules it was raced on.
  const witness = tx.getWitnessArgs(at)!.inputType!;
  const record = runner && playsByTheseRules(match.game) ? recordOf(witness, match.map) : null;
  const replayed = record ? replayRecord(runner!, record) : null;

  const header = found.blockHash ? await client.getHeaderByHash(found.blockHash) : undefined;
  const pot = match.entry * BigInt(cars.length);
  const winners: RaceResult['winners'] = [];
  const paid = new Map<string, bigint>();
  for (const output of tx.outputs) paid.set(output.lock.hash().toLowerCase(), (paid.get(output.lock.hash().toLowerCase()) ?? 0n) + output.capacity);
  const owners = [...new Set(cars.map((car) => car.owner))];
  for (const owner of owners) {
    const deposits = cars.filter((car) => car.owner === owner).reduce((sum, car) => sum + car.capacity - match.entry, 0n);
    const fee = owner === cars[0]!.owner ? FEE : 0n;
    const share = (paid.get(owner) ?? 0n) - deposits - (keyCells.get(owner) ?? 0n) + fee;
    const entries = match.entry * BigInt(cars.filter((car) => car.owner === owner).length);
    if (share > entries) winners.push({ owner, share: share.toString() });
  }
  return {
    txHash,
    matchId: matchCell.cellOutput.type!.args,
    endedMs: header ? Number(header.timestamp) : null,
    map: match.map,
    game: match.game.toLowerCase(),
    entry: match.entry.toString(),
    pot: pot.toString(),
    players: cars.map((car) => car.owner),
    winners,
    shards: replayed ? replayed.cars.map((car) => car.shards) : null,
  };
}

/**
 * Every finished race on this network, newest first, and each wallet's tally. Reads at most `limit`
 * transactions. With the rally rules (`runner`), each race is replayed to count its shards.
 */
export async function readRallyStats(client: ccc.Client, runner?: RallyRunner, limit = 400): Promise<RallyStats> {
  const races: RaceResult[] = [];
  if (liveMatch.codeHash.length > 2) {
    const prefix = ccc.Script.from({ codeHash: liveMatch.codeHash, hashType: liveMatch.hashType, args: '0x' });
    const seen = new Set<string>();
    for await (const item of client.findTransactions({ script: prefix, scriptType: 'type', scriptSearchMode: 'prefix', groupByTransaction: true }, 'desc', 100)) {
      if (seen.has(item.txHash)) continue;
      seen.add(item.txHash);
      const race = await raceOf(client, item.txHash, runner).catch(() => null);
      if (race) races.push(race);
      if (seen.size >= limit) break;
    }
  }
  // The indexer groups by block, not strictly by time.
  races.sort((a, b) => (b.endedMs ?? 0) - (a.endedMs ?? 0));
  const players: Record<string, PlayerTally> = {};
  for (const race of races) {
    for (const owner of new Set(race.players)) {
      const tally = (players[owner] ??= { played: 0, wins: 0, won: '0', shards: 0 });
      tally.played += 1;
    }
    race.shards?.forEach((shards, car) => (players[race.players[car]!]!.shards += shards));
    for (const winner of race.winners) {
      const tally = players[winner.owner]!;
      tally.wins += 1;
      tally.won = (BigInt(tally.won) + BigInt(winner.share)).toString();
    }
  }
  return { races, players, readAt: Date.now() };
}
