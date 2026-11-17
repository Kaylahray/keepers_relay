import { ccc } from '@ckb-ccc/core';
import { type SessionKey } from '@/lib/chain/session';
import { liveMatch, rallyGame, rallyRelay, REGISTRY_FEE_RATE, suddenDeathProxyLock, type ScriptConfig } from '@/lib/registry/config';
import { SIGNATURE_LEN } from '@/lib/rally/moves';
import { encodeMoves, winnersOf, type RallyEvent } from '@/lib/rally/rules';
import { requestWalletRefresh } from '@/lib/wallet-refresh';

/**
 * Matches on chain: the app's and the relay's side of `live-match`. A match cell holds the host's
 * entry and names the seats, the map, the game and the relay. Each player who joins makes their own
 * seat cell, naming the match in its cell deps. The finish spends the match and every seat that
 * raced, carries the race record, and pays the winner every entry. Any cell left over goes home to
 * its owner once a whole match has passed.
 */

/** Data lengths: version 1 had no wait; version 2 adds the lobby's wait. */
const MATCH_LEN_V1 = 139;
export const MATCH_LEN = 143;
const SEAT_LEN_V1 = 65;
export const SEAT_LEN = 69;
const OFF_WAIT = 139;
const OFF_SEAT_WAIT = 65;
const SEAT_TAG = 1;
const OFF_SEATS = 1;
const OFF_MAP = 2;
const OFF_ENTRY = 3;
const OFF_HOST = 11;
const OFF_HOST_KEY = 43;
const OFF_GAME = 75;
const OFF_RELAY = 107;
const OFF_OWNER = 1;
const OFF_KEY = 33;
const RECORD_VERSION = 2;
/** After the lobby's wait and this long, any match or seat cell may go home. Mirrors `MATCH_MS` in live-match. */
export const MATCH_MS = 10 * 60 * 1000;
export const MIN_SEATS = 2;
export const MAX_SEATS = 5;
/** The miner fee of a finish or a send-home, out of the host's or the owner's storage. live-match allows up to 0.1 CKB. */
export const FEE = 100_000n;
const SHANNONS_PER_CKB = 100_000_000n;
const SINCE_RELATIVE_TIMESTAMP = 0xc000_0000_0000_0000n;
const SECP_PLACEHOLDER = ccc.hexFrom(new Uint8Array(65));

export type MatchCell = {
  seats: number;
  map: number;
  entry: bigint;
  host: ccc.Hex;
  hostKey: ccc.Hex;
  game: ccc.Hex;
  relay: ccc.Hex;
  /** The longest the lobby waits, in seconds; 0 for a match from before hosts picked one. */
  wait: number;
};

export type OutPointRef = { txHash: string; index: string };

type Landed = { blockHash: ccc.Hex; blockNumber: bigint; landedMs: bigint };

export type Seat = {
  cell: ccc.Cell;
  owner: ccc.Hex;
  key: ccc.Hex;
  /** Its match's wait, copied when it joined, in seconds. */
  wait: number;
  landed: Landed | null;
};

/** A match as the screens and the relay see it. */
export type MatchSnapshot = {
  matchId: ccc.Hex;
  point: OutPointRef;
  cell: ccc.Cell;
  match: MatchCell;
  /** Null while the match cell is confirming. */
  landed: Landed | null;
  /** Every seat cell of this match on chain, in the order they landed; confirming ones last. */
  seats: Seat[];
};

/** One car of a race: who it pays and which key drives it. */
export type Player = { owner: ccc.Hex; key: ccc.Hex };

const hexOf = (bytes: Uint8Array): ccc.Hex => ccc.hexFrom(bytes);

/** The match cell's type script; its args are the match's id. */
export function matchScript(matchId: ccc.HexLike): ccc.Script {
  return ccc.Script.from({ codeHash: liveMatch.codeHash, hashType: liveMatch.hashType, args: ccc.hexFrom(matchId) });
}

/** Every seat of one match shares this type script: the match id and a 1. */
export function seatScript(matchId: ccc.HexLike): ccc.Script {
  return ccc.Script.from({ codeHash: liveMatch.codeHash, hashType: liveMatch.hashType, args: ccc.hexFrom(ccc.bytesConcat(matchId, [SEAT_TAG])) });
}

/** Input Type Proxy Lock: the cell can only be spent by a transaction its own live-match script checks. */
function proxyLock(typeHash: ccc.HexLike): ccc.Script {
  return ccc.Script.from({ codeHash: suddenDeathProxyLock.codeHash, hashType: suddenDeathProxyLock.hashType, args: ccc.hexFrom(typeHash) });
}

/** A player's full lock, found from its hash in a cell's history: an output it was paid to, or an input it spent. */
export async function lockFromHistory(client: ccc.Client, cell: ccc.Cell, hash: string): Promise<ccc.Script> {
  let txHash: string | undefined = cell.outPoint.txHash;
  for (let hop = 0; txHash && hop < 80; hop += 1) {
    const tx: ccc.Transaction | undefined = (await client.getTransaction(txHash))?.transaction;
    if (!tx) break;
    const found = tx.outputs.find((output) => output.lock.hash().toLowerCase() === hash.toLowerCase());
    if (found) return found.lock;
    for (const input of tx.inputs) {
      const spent = await client.getCell(input.previousOutput);
      if (spent?.cellOutput.lock.hash().toLowerCase() === hash.toLowerCase()) return spent.cellOutput.lock;
    }
    txHash = tx.inputs[0]?.previousOutput.txHash;
  }
  throw new Error('A player’s lock could not be read from this match’s history.');
}

function view(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

export function encodeMatch(cell: MatchCell): Uint8Array {
  const data = new Uint8Array(MATCH_LEN);
  data[0] = 2;
  data[OFF_SEATS] = cell.seats;
  data[OFF_MAP] = cell.map;
  view(data).setBigUint64(OFF_ENTRY, cell.entry, true);
  data.set(ccc.bytesFrom(cell.host), OFF_HOST);
  data.set(ccc.bytesFrom(cell.hostKey), OFF_HOST_KEY);
  data.set(ccc.bytesFrom(cell.game), OFF_GAME);
  data.set(ccc.bytesFrom(cell.relay), OFF_RELAY);
  view(data).setUint32(OFF_WAIT, cell.wait, true);
  return data;
}

export function decodeMatch(raw: Uint8Array): MatchCell | null {
  const v1 = raw.length === MATCH_LEN_V1 && raw[0] === 1;
  if (!v1 && !(raw.length === MATCH_LEN && raw[0] === 2)) return null;
  return {
    seats: raw[OFF_SEATS]!,
    map: raw[OFF_MAP]!,
    entry: view(raw).getBigUint64(OFF_ENTRY, true),
    host: hexOf(raw.slice(OFF_HOST, OFF_HOST + 32)),
    hostKey: hexOf(raw.slice(OFF_HOST_KEY, OFF_HOST_KEY + 32)),
    game: hexOf(raw.slice(OFF_GAME, OFF_GAME + 32)),
    relay: hexOf(raw.slice(OFF_RELAY, OFF_RELAY + 32)),
    wait: v1 ? 0 : view(raw).getUint32(OFF_WAIT, true),
  };
}

/** A seat has its match's version: with the match's wait, or none for a match from before. */
function encodeSeat(owner: ccc.Hex, key: ccc.Hex, wait: number): Uint8Array {
  const data = new Uint8Array(wait > 0 ? SEAT_LEN : SEAT_LEN_V1);
  data[0] = wait > 0 ? 2 : 1;
  data.set(ccc.bytesFrom(owner), OFF_OWNER);
  data.set(ccc.bytesFrom(key), OFF_KEY);
  if (wait > 0) view(data).setUint32(OFF_SEAT_WAIT, wait, true);
  return data;
}

export function decodeSeat(raw: Uint8Array): { owner: ccc.Hex; key: ccc.Hex; wait: number } | null {
  const v1 = raw.length === SEAT_LEN_V1 && raw[0] === 1;
  if (!v1 && !(raw.length === SEAT_LEN && raw[0] === 2)) return null;
  return { owner: hexOf(raw.slice(OFF_OWNER, OFF_OWNER + 32)), key: hexOf(raw.slice(OFF_KEY, OFF_KEY + 32)), wait: v1 ? 0 : view(raw).getUint32(OFF_SEAT_WAIT, true) };
}

function toCellDep(s: ScriptConfig): ccc.CellDep {
  return ccc.CellDep.from({ outPoint: { txHash: s.outPoint.txHash, index: s.outPoint.index }, depType: s.depType });
}

/** Every code cell a match may run: the match script, the rally game and the proxy lock. */
export function matchCellDeps(): ccc.CellDep[] {
  return [toCellDep(liveMatch), toCellDep(rallyGame), toCellDep(suddenDeathProxyLock)];
}

function minCapacity(lock: ccc.Script, type: ccc.Script | undefined, dataLength: number): bigint {
  const output = ccc.CellOutput.from({ capacity: 0n, lock, type });
  return (BigInt(output.occupiedSize) + BigInt(dataLength)) * SHANNONS_PER_CKB;
}

async function landedOf(client: ccc.Client, txHash: string): Promise<Landed | null> {
  const found = await client.getTransaction(txHash);
  const header = found?.blockHash ? await client.getHeaderByHash(found.blockHash) : undefined;
  return found?.blockHash && header ? { blockHash: found.blockHash, blockNumber: BigInt(header.number), landedMs: BigInt(header.timestamp) } : null;
}

/** Every seat cell of a match on chain, in the order they landed. Seats outlive their match when they never raced. */
export async function findSeats(client: ccc.Client, matchId: ccc.Hex): Promise<Seat[]> {
  const seats: Seat[] = [];
  for await (const cell of client.findCellsOnChain({ script: seatScript(matchId), scriptType: 'type', scriptSearchMode: 'exact', withData: true }, 'asc', 40)) {
    const seat = decodeSeat(ccc.bytesFrom(cell.outputData));
    if (seat) seats.push({ cell, ...seat, landed: await landedOf(client, cell.outPoint.txHash) });
  }
  // The order they landed in, so every phone and the relay line the cars up the same way.
  const order = (seat: Seat) => seat.landed?.blockNumber ?? BigInt(Number.MAX_SAFE_INTEGER);
  return seats.sort((a, b) => {
    const by = order(a) - order(b);
    if (by !== 0n) return by < 0n ? -1 : 1;
    const ka = `${a.cell.outPoint.txHash}:${a.cell.outPoint.index}`;
    const kb = `${b.cell.outPoint.txHash}:${b.cell.outPoint.index}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

async function snapshotOf(client: ccc.Client, cell: ccc.Cell): Promise<MatchSnapshot | null> {
  const match = decodeMatch(ccc.bytesFrom(cell.outputData));
  if (!match) return null;
  const matchId = cell.cellOutput.type!.args;
  return {
    matchId,
    point: { txHash: cell.outPoint.txHash, index: ccc.numToHex(cell.outPoint.index) },
    cell,
    match,
    landed: await landedOf(client, cell.outPoint.txHash),
    seats: await findSeats(client, matchId),
  };
}

/** The seats that race: landed ones, in order, as many as the host left room for. */
export function racingSeats(snapshot: MatchSnapshot): Seat[] {
  return snapshot.seats.filter((seat) => seat.landed).slice(0, snapshot.match.seats - 1);
}

/** Every car of the match as it stands: the host, then each racing seat. */
export function playersOf(snapshot: MatchSnapshot, seats = racingSeats(snapshot)): Player[] {
  return [{ owner: snapshot.match.host, key: snapshot.match.hostKey }, ...seats.map((seat) => ({ owner: seat.owner, key: seat.key }))];
}

/** The live match cell of a match, by its id. Null once it has ended. */
export async function findMatch(client: ccc.Client, matchId: string): Promise<MatchSnapshot | null> {
  // Straight from the chain: the relay spends the cell, so this wallet's own cell cache never hears of it.
  for await (const cell of client.findCellsOnChain({ script: matchScript(matchId), scriptType: 'type', scriptSearchMode: 'exact', withData: true }, 'desc', 1)) {
    return snapshotOf(client, cell);
  }
  return null;
}

/** Every live match on this network, newest first. */
export async function listMatches(client: ccc.Client, limit = 30): Promise<MatchSnapshot[]> {
  const prefix = ccc.Script.from({ codeHash: liveMatch.codeHash, hashType: liveMatch.hashType, args: '0x' });
  const found: MatchSnapshot[] = [];
  for await (const cell of client.findCellsOnChain({ script: prefix, scriptType: 'type', scriptSearchMode: 'prefix', withData: true }, 'desc', limit * 6)) {
    if (ccc.bytesFrom(cell.cellOutput.type!.args).length !== 32) continue;
    const snapshot = await snapshotOf(client, cell).catch(() => null);
    if (snapshot) found.push(snapshot);
    if (found.length >= limit) break;
  }
  return found;
}

/** How a match ended: the transaction that spent its cell, or null while it is still on. */
export async function matchEnding(client: ccc.Client, matchId: string): Promise<{ txHash: ccc.Hex; endedMs: number | null } | null> {
  const script = matchScript(matchId);
  for await (const item of client.findTransactionsByType(script, false, 'desc', 1)) {
    const found = await client.getTransaction(item.txHash);
    if (!found || found.transaction.outputs.some((output) => output.type?.eq(script))) return null;
    const header = found.blockHash ? await client.getHeaderByHash(found.blockHash) : undefined;
    return { txHash: item.txHash, endedMs: header ? Number(header.timestamp) : null };
  }
  return null;
}

/** Opens a match: the host's entry, naming the session key that drives their car and signs its moves. */
export async function openMatch(
  signer: ccc.Signer,
  input: { entry: bigint; seats: number; map: number; session: SessionKey; /** In seconds, 60 to 3600. */ wait: number },
): Promise<{ matchId: ccc.Hex; point: OutPointRef }> {
  const owner = (await signer.getRecommendedAddressObj()).script;
  const data = encodeMatch({
    seats: input.seats,
    map: input.map,
    entry: input.entry,
    host: owner.hash(),
    hostKey: input.session.lock.hash(),
    game: ccc.hexFrom(rallyGame.codeHash),
    relay: ccc.hexFrom(rallyRelay.lockHash),
    wait: input.wait,
  });
  // The type id comes from the first input, known only once the wallet funds the transaction.
  const placeholder = matchScript(new Uint8Array(32));
  const placeholderGuard = proxyLock(new Uint8Array(32));
  const tx = ccc.Transaction.from({
    outputs: [
      ccc.CellOutput.from({ capacity: input.entry + minCapacity(placeholderGuard, placeholder, MATCH_LEN), lock: placeholderGuard, type: placeholder }),
    ],
    outputsData: [ccc.hexFrom(data)],
    cellDeps: matchCellDeps(),
  });
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  const matchId = ccc.hashTypeId(tx.inputs[0]!, 0);
  const live = matchScript(matchId);
  tx.outputs[0]!.type = live;
  tx.outputs[0]!.lock = proxyLock(live.hash());
  const txHash = await signer.sendTransaction(tx);
  requestWalletRefresh();
  return { matchId, point: { txHash, index: '0x0' } };
}

/** Takes a seat: the player's entry in a seat cell of their own, naming their session key. */
export async function joinMatch(signer: ccc.Signer, snapshot: MatchSnapshot, session: SessionKey): Promise<OutPointRef> {
  const owner = (await signer.getRecommendedAddressObj()).script;
  const players = playersOf(snapshot);
  if (players.some((player) => player.owner.toLowerCase() === owner.hash().toLowerCase())) throw new Error('You are already in this match.');
  if (players.length >= snapshot.match.seats) throw new Error('This match is full.');
  const type = seatScript(snapshot.matchId);
  const guard = proxyLock(type.hash());
  const data = encodeSeat(owner.hash(), session.lock.hash(), snapshot.match.wait);
  const tx = ccc.Transaction.from({
    outputs: [
      ccc.CellOutput.from({ capacity: snapshot.match.entry + minCapacity(guard, type, data.length), lock: guard, type }),
    ],
    outputsData: [ccc.hexFrom(data)],
    // The seat names its match without spending it, so players never queue behind each other.
    cellDeps: [...matchCellDeps(), ccc.CellDep.from({ outPoint: snapshot.cell.outPoint, depType: 'code' })],
  });
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  const txHash = await signer.sendTransaction(tx);
  requestWalletRefresh();
  return { txHash, index: '0x0' };
}

/** How long a cell of a match with this wait (in seconds) holds before it may go home, in ms. */
export function holdMs(wait: number): number {
  return wait * 1000 + MATCH_MS;
}

/** Whether a cell that landed at `landedMs`, of a match with this wait, may go home by now. */
export function mayGoHome(landedMs: bigint | null | undefined, nowMs: number, wait: number): boolean {
  return landedMs != null && nowMs >= Number(landedMs) + holdMs(wait);
}

/**
 * Sends a match or seat cell home to its owner once its lobby's wait and a whole match have passed
 * since it landed. The cell pays its own fee, so anyone may send it and no wallet is needed.
 */
export async function sendHome(client: ccc.Client, cell: ccc.Cell, ownerHash: string, wait: number): Promise<string> {
  const owner = await lockFromHistory(client, cell, ownerHash);
  const tx = ccc.Transaction.from({
    inputs: [ccc.CellInput.from({ previousOutput: cell.outPoint, since: SINCE_RELATIVE_TIMESTAMP | BigInt(holdMs(wait) / 1000) })],
    outputs: [ccc.CellOutput.from({ capacity: BigInt(cell.cellOutput.capacity) - FEE, lock: owner })],
    outputsData: ['0x'],
    cellDeps: matchCellDeps(),
  });
  const txHash = await client.sendTransaction(tx);
  requestWalletRefresh();
  return txHash;
}

/** The live cell a lock holds with no type and no data: the relay's cell. */
export async function plainCellOf(client: ccc.Client, lock: ccc.Script): Promise<ccc.Cell | null> {
  for await (const cell of client.findCellsOnChain({ script: lock, scriptType: 'lock', scriptSearchMode: 'exact', filter: { scriptLenRange: [0, 1], outputDataLenRange: [0, 1] } }, 'desc', 1)) {
    return cell;
  }
  return null;
}

/** The relay closes a lobby nobody joined: the host's cell goes home, the relay's cell signs and comes back. */
export async function closeMatchTx(client: ccc.Client, snapshot: MatchSnapshot, relayCell: ccc.Cell): Promise<ccc.Transaction> {
  const host = await lockFromHistory(client, snapshot.cell, snapshot.match.host);
  const tx = ccc.Transaction.from({
    inputs: [snapshot.cell, relayCell].map((input) => ccc.CellInput.from({ previousOutput: input.outPoint, since: 0 })),
    outputs: [
      ccc.CellOutput.from({ capacity: BigInt(snapshot.cell.cellOutput.capacity) - FEE, lock: host }),
      ccc.CellOutput.from({ capacity: relayCell.cellOutput.capacity, lock: relayCell.cellOutput.lock }),
    ],
    outputsData: ['0x', '0x'],
    cellDeps: matchCellDeps(),
  });
  await tx.addCellDepsOfKnownScripts(client, ccc.KnownScript.Secp256k1Blake160);
  tx.setWitnessArgs(1, ccc.WitnessArgs.from({ lock: SECP_PLACEHOLDER }));
  return tx;
}

/** What each player's wallet is owed by a race's results, mirroring live-match. Host first. */
export function payouts(entry: bigint, capacities: bigint[], owners: ccc.Hex[], results: number[]): Map<string, bigint> {
  const winners = winnersOf(results);
  const owed = new Map<string, bigint>();
  const add = (owner: ccc.Hex, amount: bigint) => owed.set(owner.toLowerCase(), (owed.get(owner.toLowerCase()) ?? 0n) + amount);
  capacities.forEach((capacity, car) => add(owners[car]!, winners.length === 0 ? capacity : capacity - entry));
  if (winners.length > 0) {
    const pot = entry * BigInt(capacities.length);
    const share = pot / BigInt(winners.length);
    winners.forEach((car, n) => add(owners[car]!, share + (n === 0 ? pot % BigInt(winners.length) : 0n)));
  }
  // The host's storage pays the fee.
  add(owners[0]!, -FEE);
  return owed;
}

/**
 * The record a finish carries, after its version: `cars u8 ‖ per car: count u16 LE ‖ events ‖
 * signature`. A car with no signature gets 65 zero bytes: only the winners' moves must be signed.
 */
export function signedRecord(tapes: RallyEvent[][], signatures: (ccc.Hex | null)[]): Uint8Array {
  const parts: Uint8Array[] = [Uint8Array.of(tapes.length)];
  tapes.forEach((events, car) => {
    parts.push(encodeMoves(events));
    const signature = signatures[car];
    parts.push(signature ? ccc.bytesFrom(signature) : new Uint8Array(SIGNATURE_LEN));
  });
  return ccc.bytesConcat(...parts);
}

/**
 * The finish of a race: the signed record in the match cell's witness, the seats that raced spent
 * in car order, the relay's cell spent and sent back, and the entries paid by the results. The
 * relay sends it alone: live-match checks each winner's moves against that winner's key.
 */
export async function matchFinishTx(
  client: ccc.Client,
  snapshot: MatchSnapshot,
  finish: { record: Uint8Array; results: number[]; seats: ccc.Cell[]; relayCell: ccc.Cell },
): Promise<ccc.Transaction> {
  const { cell, match } = snapshot;
  const seats = finish.seats.map((seatCell) => decodeSeat(ccc.bytesFrom(seatCell.outputData)));
  if (seats.some((seat) => !seat)) throw new Error('A seat in the finish is not a seat.');
  const players: Player[] = [{ owner: match.host, key: match.hostKey }, ...seats.map((seat) => seat!)];
  const cells = [cell, ...finish.seats];
  const locks = new Map<string, ccc.Script>();
  for (const [car, player] of players.entries()) {
    if (!locks.has(player.owner.toLowerCase())) locks.set(player.owner.toLowerCase(), await lockFromHistory(client, cells[car]!, player.owner));
  }
  const owed = payouts(
    match.entry,
    cells.map((c) => BigInt(c.cellOutput.capacity)),
    players.map((player) => player.owner),
    finish.results,
  );
  const paid = [...owed].map(([owner, capacity]) => ({ capacity, lock: locks.get(owner)! }));
  // The relay's cell comes back to the relay.
  const outputs = [...paid, { capacity: BigInt(finish.relayCell.cellOutput.capacity), lock: finish.relayCell.cellOutput.lock }];
  const tx = ccc.Transaction.from({
    inputs: [...cells, finish.relayCell].map((input) => ccc.CellInput.from({ previousOutput: input.outPoint, since: 0 })),
    outputs: outputs.map((output) => ccc.CellOutput.from(output)),
    outputsData: outputs.map(() => '0x'),
    cellDeps: matchCellDeps(),
  });
  await tx.addCellDepsOfKnownScripts(client, ccc.KnownScript.Secp256k1Blake160);
  const witness = new Uint8Array(1 + finish.record.length);
  witness[0] = RECORD_VERSION;
  witness.set(finish.record, 1);
  tx.setWitnessArgs(0, ccc.WitnessArgs.from({ inputType: witness }));
  tx.setWitnessArgs(cells.length, ccc.WitnessArgs.from({ lock: SECP_PLACEHOLDER }));
  return tx;
}
