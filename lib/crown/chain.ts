import { ccc } from '@ckb-ccc/core';
import {
  bytesToHex,
  certifiedAfter,
  ckbHash,
  CLOSER_REWARD,
  decodeBidData,
  decodeEntryRun,
  foldLap,
  LAPS,
  sealedBidData,
  SEAL_VERSION,
  type SealedLap,
  DEFAULT_POW_BITS,
  decodeMatchCell,
  encodeBidData,
  encodeMatchCell,
  hexToBytes,
  landBy,
  MATCH_VERSION,
  MAX_TX_FEE,
  REFUND_GRACE_MS,
  LAP_WINDOW_MS,
  lapOnTime,
  runSeed,
  runWitness,
  shrunkDeadline,
  solvePow,
  winnerOf,
  type MatchCell,
} from '@/lib/sudden-death/codec';
import { applySteal, DEFAULT_DURATION_MS, type CrownRoom, type LockRef, type OutPointRef } from '@/lib/crown/rooms';
import { requestWalletRefresh } from '@/lib/wallet-refresh';
import { readLiveCell } from '@/lib/ckb/live-cell';
import { CONFIRM_PAD_MS } from '@/lib/crown/phase';
import { REGISTRY_FEE_RATE, suddenDeathBidType } from '@/lib/registry/config';
import {
  getSuddenDeathBidLock,
  getSuddenDeathBidScript,
  getSuddenDeathCellDeps,
  getSuddenDeathMatchScript,
  getSuddenDeathProxyLock,
  getSuddenDeathTreasuryScript,
  suddenDeathGameHash,
} from '@/lib/crown/scripts';

const SHANNONS_PER_CKB = 100_000_000n;
const SINCE_ABSOLUTE = 0x4000_0000_0000_0000n;
/**
 * What unsigned transactions actually pay: 0.01 CKB per KB. Well above the node's minimum, so a
 * steal is picked up fast, and well below its maximum of 0.1 CKB per KB. Paying the whole
 * `MAX_TX_FEE` breaks that maximum on any transaction under 1 KB, which a refund always is.
 */
const FEE_PER_KB = 1_000_000n;
const ZERO_32 = new Uint8Array(32);

/** Miner fee for a transaction nobody signs, from its serialized size. */
function sizedFee(tx: ccc.Transaction): bigint {
  const bytes = BigInt(tx.toBytes().length + 4);
  const fee = ((bytes * FEE_PER_KB + 1023n) / 1024n);
  return fee > MAX_TX_FEE ? MAX_TX_FEE : fee;
}

/** The bid was signed against a match cell a steal has already consumed. */
/** The entry this browser remembered is gone: spent by an earlier steal, or never confirmed. */
export class EntryGoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EntryGoneError';
  }
}

export class MatchMovedError extends Error {
  readonly room: CrownRoom;

  constructor(room: CrownRoom) {
    super('The match moved on. Approve once more to enter.');
    this.name = 'MatchMovedError';
    this.room = room;
  }
}

/**
 * The node turned a steal away because the match cell it spends is already being spent: another
 * player's steal got there in the same few seconds. Nothing moved, the entry is untouched, and the
 * same run can be sent again on top of the new round. Any other failure is not a lost race.
 */
export function isLostRace(error: unknown): boolean {
  // CCC turns the node's double-spend replies into these: an input already spent ("Unknown"), the
  // same transaction twice, or a replacement the pool refused.
  if (
    error instanceof ccc.ErrorClientResolveUnknown ||
    error instanceof ccc.ErrorClientDuplicatedTransaction ||
    error instanceof ccc.ErrorClientRBFRejected
  ) {
    return true;
  }
  const text = error instanceof Error ? `${error.message} ${(error as { data?: string }).data ?? ''}` : String(error ?? '');
  return /dead|unknown ?\(?out ?point|conflict|rbf|duplicated|failedtoresolve|failed to resolve/i.test(text);
}

/** The entry's run window has closed: a steal made with it would land but could never count. */
export class RoadExpiredError extends Error {
  constructor() {
    super('Your road’s time is up. Pay a new entry for a new road. This entry comes back after the game.');
    this.name = 'RoadExpiredError';
  }
}

/** The run no longer beats the standing king — someone posted a better one first. */
export class RunBeatenError extends Error {
  readonly kingScore: number;

  constructor(score: number, kingScore: number) {
    super(`Your run scored ${score}, and the crown now stands at ${kingScore}. Beat that to take it.`);
    this.name = 'RunBeatenError';
    this.kingScore = kingScore;
  }
}

type Signer = ccc.Signer;

/** A finished run: its tape, and the score the wasm build gave it on the player's own course. */
/**
 * A finished run: every sealed lap (the block that seeded its road, and its moves), and the score
 * the wasm build gave the whole run.
 */
export type PlayedRun = { laps: SealedLap[]; score: number };

function minCapacity(lock: ccc.Script, type: ccc.Script | undefined, data: Uint8Array): bigint {
  const cellOutput = ccc.CellOutput.from({ capacity: ccc.numFrom(0), lock, type });
  return (BigInt(cellOutput.occupiedSize) + BigInt(data.length)) * SHANNONS_PER_CKB;
}

function sameHash(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function concatArgs(typeId: string, hostHash: string): ccc.Hex {
  const args = new Uint8Array(64);
  args.set(ccc.bytesFrom(typeId), 0);
  args.set(ccc.bytesFrom(hostHash), 32);
  return ccc.hexFrom(args);
}

async function lockOf(signer: Signer): Promise<ccc.Script> {
  return (await signer.getRecommendedAddressObj()).script;
}

async function liveCell(client: ccc.Client, point: OutPointRef): Promise<ccc.Cell> {
  // `getCell` would answer for a cell that has already been spent, and the transaction
  // built on top of that answer dies at the node. Ask whether the cell is live.
  const cell = await readLiveCell(client, point);
  if (!cell) {
    throw new Error('That cell is not on chain yet. Wait for the last transaction to confirm.');
  }
  return cell;
}

function lockRef(script: ccc.Script): LockRef {
  const hashType = script.hashType;
  if (hashType !== 'type' && hashType !== 'data' && hashType !== 'data1' && hashType !== 'data2') {
    throw new Error('Unsupported lock hash type.');
  }
  return { codeHash: script.codeHash, hashType, args: script.args };
}

// The pad lives in `phase.ts` so the server and the screens can both read it without importing
// this file. Re-exported so nothing that imported it here breaks.
export { CONFIRM_PAD_MS };

/**
 * Wait for a cell this browser just sent to become live.
 *
 * An output is not live until its transaction is committed, which takes a few blocks, so an
 * entry locked a moment ago cannot be spent in the same breath. Waiting turns a confusing error
 * into a visible countdown. It gives up early when the transaction is rejected, or committed
 * with the cell already spent, because waiting longer cannot change either answer.
 */
async function waitLive(
  client: ccc.Client,
  point: OutPointRef,
  onStatus?: (message: string) => void,
  timeoutMs = 150_000,
): Promise<ccc.Cell> {
  const started = Date.now();
  for (;;) {
    const cell = await readLiveCell(client, point);
    if (cell) return cell;

    const status = (await client.getTransaction(point.txHash).catch(() => null))?.status;
    if (status === 'rejected') {
      throw new EntryGoneError('That entry was rejected by the network. Lock a new one.');
    }
    if (status === 'committed') {
      throw new EntryGoneError('That entry was already spent. Lock a new one.');
    }

    const waited = Date.now() - started;
    if (waited >= timeoutMs) {
      throw new Error('Your entry is still confirming. Give it another minute, then submit again.');
    }
    onStatus?.(`Confirming your entry… ${Math.floor(waited / 1000)}s`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

/** The match cell's data. Crowns opened under the version 2 rules cannot be played or closed here. */
function readMatch(cell: ccc.Cell): MatchCell {
  const raw = hexToBytes(cell.outputData);
  if (raw[0] !== MATCH_VERSION) {
    throw new Error('This crown runs on the old rules. It can be closed from the old version of the app.');
  }
  return decodeMatchCell(raw);
}

/**
 * A cell's postmark: the block it landed in, and that block's time. Steals and closes list the
 * block in `header_deps`, so the scripts can read when the last steal, or an entry, really landed.
 * Null while the transaction that made it is still confirming.
 */
async function landedBlock(
  client: ccc.Client,
  txHash: string,
): Promise<{ blockHash: ccc.Hex; landedMs: bigint } | null> {
  const blockHash = (await client.getTransaction(txHash))?.blockHash;
  const header = blockHash ? await client.getHeaderByHash(blockHash) : undefined;
  return blockHash && header ? { blockHash, landedMs: BigInt(header.timestamp) } : null;
}

async function postmarkOf(client: ccc.Client, cell: ccc.Cell): Promise<{ blockHash: ccc.Hex; landedMs: bigint }> {
  const landed = await landedBlock(client, cell.outPoint.txHash);
  if (!landed) throw new Error('The match cell is still confirming. Wait a few seconds, then try again.');
  return landed;
}

/**
 * A throwaway key the player's browser seals laps with, so laps need no wallet popup. It owns one
 * small "key cell" under CKB's built-in secp256k1 lock; every seal spends that cell, so CKB's own
 * lock checks the signature and the entry script only checks the key cell is there.
 */
export type SessionKey = { secret: ccc.Hex; lock: ccc.Script };

/** What the key cell keeps for the miner fees of every seal and of its return. */
export const KEY_CELL_FEES = 1n * SHANNONS_PER_CKB;

/**
 * The key cell's capacity. It must hold itself, and once the run is over it goes back to the owner
 * as one plain cell, so it must also hold a cell under the owner's lock (JoyID's needs 63 CKB).
 */
export function keyCellCapacity(session: ccc.Script, owner: ccc.Script): bigint {
  const own = minCapacity(session, undefined, new Uint8Array());
  const back = minCapacity(owner, undefined, new Uint8Array());
  return (own > back ? own : back) + KEY_CELL_FEES;
}

export async function newSessionKey(client: ccc.Client): Promise<SessionKey> {
  const secret = ccc.hexFrom(crypto.getRandomValues(new Uint8Array(32)));
  const signer = new ccc.SignerCkbPrivateKey(client, secret);
  return { secret, lock: (await signer.getRecommendedAddressObj()).script };
}

/** The session key's live key cell, if any. */
async function keyCellOf(signer: ccc.SignerCkbPrivateKey): Promise<ccc.Cell | null> {
  const lock = (await signer.getRecommendedAddressObj()).script;
  for await (const cell of signer.client.findCells({ script: lock, scriptType: 'lock', scriptSearchMode: 'exact' }, 'desc', 1)) {
    return cell;
  }
  return null;
}

/**
 * Sends a run's key cell back to its owner, signed by the session key. Nothing to return gives
 * null. Called once the run is over; the entry itself is returned by the grab or the close.
 */
export async function returnKeyCell(client: ccc.Client, session: ccc.Hex, owner: ccc.Script): Promise<string | null> {
  const signer = new ccc.SignerCkbPrivateKey(client, session);
  const key = await keyCellOf(signer);
  if (!key) return null;
  const tx = ccc.Transaction.from({
    inputs: [ccc.CellInput.from({ previousOutput: key.outPoint, since: 0 })],
    outputs: [ccc.CellOutput.from({ capacity: key.cellOutput.capacity, lock: owner })],
    outputsData: ['0x'],
  });
  await tx.completeFeeChangeToOutput(signer, 0, REGISTRY_FEE_RATE);
  return signer.sendTransaction(tx);
}

/** Where a player's run stands: the live entry, laps sealed so far, and the next lap's road. */
export type EntryLap = {
  point: OutPointRef;
  sealed: number;
  /** The block the entry last landed in. It seeds the next lap. */
  block: ccc.Hex;
  /** The next lap's seed. Mirrors the scripts: match, player and that block's hash. */
  seed: bigint;
  /**
   * When the current lap's window closes: the next seal, or a grab, must land by then (the match
   * deadline may close it sooner). Each lap's window opens with the block its road came from.
   */
  windowEndsMs: number;
  /** The last lap was sealed after its window closed: the run can't go on, and the entry waits for its refund. */
  late: boolean;
};

/**
 * The next lap an entry reveals, or null while the entry is still confirming (or already spent).
 * Lap 1's road comes from the block the entry landed in; each later lap's from the block where the
 * lap before it was sealed.
 */
export async function entryLap(
  client: ccc.Client,
  matchId: string,
  ownerLockHash: string,
  entry: OutPointRef,
): Promise<EntryLap | null> {
  const cell = await readLiveCell(client, entry);
  const landed = cell ? await landedBlock(client, entry.txHash) : null;
  if (!cell || !landed) return null;
  const run = decodeEntryRun(hexToBytes(cell.outputData));
  return {
    point: entry,
    sealed: run.laps,
    block: landed.blockHash,
    seed: runSeed(matchId, ownerLockHash, landed.blockHash),
    windowEndsMs: Number(landed.landedMs) + LAP_WINDOW_MS,
    late: run.laps > 0 && !lapOnTime(run.lapStartMs, landed.landedMs),
  };
}

/**
 * Seals a finished lap into the player's entry. No wallet signs it: the browser's session key does,
 * and the entry script checks that key, folds this lap's block and moves into the lap chain, and
 * takes at most the miner fee. The block this seal lands in seeds the next lap. Returns the
 * entry's new out point.
 */
export async function sealLap(
  client: ccc.Client,
  entry: OutPointRef,
  session: ccc.Hex,
  tape: Uint8Array,
  onStatus?: (message: string) => void,
): Promise<OutPointRef> {
  const cell = await waitLive(client, entry, onStatus);
  const type = cell.cellOutput.type;
  if (!type) throw new Error('That entry has no type script.');
  const landed = await landedBlock(client, entry.txHash);
  if (!landed) throw new Error('Your entry is still confirming. Give it a few seconds.');
  const raw = hexToBytes(cell.outputData);
  const run = decodeEntryRun(raw);
  if (run.laps >= LAPS) throw new Error('Every lap is already sealed.');
  if (run.laps > 0 && !lapOnTime(run.lapStartMs, landed.landedMs)) {
    throw new Error('Your last lap was sealed after its window closed, so this run can’t go on.');
  }
  const movesHash = ckbHash([tape]);
  const chain = foldLap(run.chain, hexToBytes(landed.blockHash), movesHash);
  const laps = run.laps + 1;
  // The new lap's road appeared when the entry being spent landed.
  const data = sealedBidData(raw, laps, landed.landedMs, chain);
  const witness = new Uint8Array(1 + 32);
  witness[0] = SEAL_VERSION;
  witness.set(movesHash, 1);
  // The key cell rides along: CKB's built-in lock checks the session key signed this whole
  // transaction, new lap chain included, and the key cell pays the miner fee.
  const signer = new ccc.SignerCkbPrivateKey(client, session);
  const key = await keyCellOf(signer);
  if (!key) throw new Error('This run’s key cell is missing, so its laps can’t be sealed.');
  const tx = ccc.Transaction.from({
    inputs: [
      ccc.CellInput.from({ previousOutput: cell.outPoint, since: 0 }),
      ccc.CellInput.from({ previousOutput: key.outPoint, since: 0 }),
    ],
    outputs: [
      ccc.CellOutput.from({ capacity: cell.cellOutput.capacity, lock: cell.cellOutput.lock, type }),
      ccc.CellOutput.from({ capacity: key.cellOutput.capacity, lock: key.cellOutput.lock }),
    ],
    outputsData: [ccc.hexFrom(data), '0x'],
    cellDeps: getSuddenDeathCellDeps(),
    headerDeps: [landed.blockHash],
  });
  tx.setWitnessArgsAt(0, { inputType: ccc.hexFrom(witness) });
  await tx.completeFeeChangeToOutput(signer, 1, REGISTRY_FEE_RATE);
  onStatus?.(`Sealing lap ${laps} on chain…`);
  const txHash = await signer.sendTransaction(tx);
  return { txHash, index: '0x0' };
}

function sinceFor(deadlineMs: bigint): bigint {
  return SINCE_ABSOLUTE | (deadlineMs / 1000n);
}

function pointOf(cell: ccc.Cell): OutPointRef {
  return { txHash: cell.outPoint.txHash, index: ccc.numToHex(cell.outPoint.index) };
}

function ownerScriptOf(data: ccc.HexLike): ccc.Script {
  return decodeBidData(ccc.bytesFrom(data)).owner;
}

async function findOne(
  client: ccc.Client,
  script: ccc.Script,
  scriptType: 'lock' | 'type',
): Promise<ccc.Cell | null> {
  for await (const cell of client.findCells(
    { script, scriptType, scriptSearchMode: 'exact', withData: true },
    'desc',
    1,
  )) {
    return cell;
  }
  return null;
}

/** The stored match outpoint dies on every steal. Returns the live cell and whether it moved. */
async function locateMatch(
  client: ccc.Client,
  room: CrownRoom,
): Promise<{ room: CrownRoom; cell: ccc.Cell; moved: boolean }> {
  if (!room.matchOutPoint || !room.matchId || !room.hostLockHash) {
    throw new Error('Start the clock before locking an entry.');
  }
  // The saved point is right until someone else's steal spends it. `getCell` cannot tell the
  // difference, so this asks the node whether the cell is still live. A dead one means the
  // match moved, and the search below finds where it moved to.
  const stored = await readLiveCell(client, room.matchOutPoint);
  if (stored?.cellOutput.type) return { room, cell: stored, moved: false };
  const type = getSuddenDeathMatchScript(concatArgs(room.matchId, room.hostLockHash));
  const cell = await findOne(client, type, 'type');
  if (!cell?.cellOutput.type) {
    throw new Error('The match cell is still confirming. Wait a few seconds, then try again.');
  }
  const matchTypeHash = cell.cellOutput.type.hash();
  const treasury = await findOne(client, getSuddenDeathTreasuryScript(matchTypeHash), 'lock');
  return {
    cell,
    moved: true,
    room: {
      ...room,
      matchOutPoint: pointOf(cell),
      treasuryOutPoint: treasury ? pointOf(treasury) : room.treasuryOutPoint,
    },
  };
}

async function payFee(signer: Signer, tx: ccc.Transaction): Promise<ccc.Transaction> {
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  return signer.prepareTransaction(tx);
}

export async function openMatch(signer: Signer, room: CrownRoom): Promise<CrownRoom> {
  const host = await lockOf(signer);
  const hostHash = host.hash();
  // The cell's deadline is fixed at send time and confirmation takes a minute or more. The pad
  // keeps that wait out of the length the host chose; `phase.ts` turns it into the entry window.
  const deadlineMs = BigInt(Date.now() + (room.durationMs || DEFAULT_DURATION_MS) + CONFIRM_PAD_MS);
  const game = suddenDeathGameHash();
  const cellFor = (matchId: Uint8Array, treasury: ccc.Script) =>
    encodeMatchCell({
      version: MATCH_VERSION,
      round: 1,
      deadlineMs,
      fee: room.feeShannons,
      pot: 0n,
      king: ZERO_32,
      game,
      treasury: hexToBytes(treasury.hash()),
      bidCode: hexToBytes(suddenDeathBidType.codeHash),
      kingScore: 0n,
      landByMs: 0n,
      certified: ZERO_32,
      certifiedScore: 0n,
      powBits: DEFAULT_POW_BITS,
    });
  // The type id depends on the first input, which is only known once the wallet funds the
  // transaction. Size it with placeholders, fund it, then write the real scripts in.
  const matchScript = getSuddenDeathMatchScript(concatArgs(ccc.hexFrom(ZERO_32), hostHash));
  const treasuryScript = getSuddenDeathTreasuryScript(ccc.hexFrom(ZERO_32));
  const placeholderGuard = getSuddenDeathProxyLock(ccc.hexFrom(ZERO_32));
  const placeholderData = cellFor(ZERO_32, treasuryScript);
  const tx = ccc.Transaction.from({
    outputs: [
      ccc.CellOutput.from({
        capacity: minCapacity(placeholderGuard, matchScript, placeholderData),
        lock: placeholderGuard,
        type: matchScript,
      }),
      ccc.CellOutput.from({ capacity: minCapacity(treasuryScript, undefined, new Uint8Array()), lock: treasuryScript }),
    ],
    outputsData: [ccc.hexFrom(placeholderData), '0x'],
    cellDeps: getSuddenDeathCellDeps(),
  });
  const funded = await payFee(signer, tx);
  const typeId = ccc.hashTypeId(funded.inputs[0]!, 0);
  const liveMatch = getSuddenDeathMatchScript(concatArgs(typeId, hostHash));
  const matchTypeHash = liveMatch.hash();
  const liveTreasury = getSuddenDeathTreasuryScript(matchTypeHash);
  const guard = getSuddenDeathProxyLock(matchTypeHash);
  const liveData = cellFor(hexToBytes(typeId), liveTreasury);
  funded.outputs[0]!.lock = guard;
  funded.outputs[0]!.type = liveMatch;
  funded.outputs[0]!.capacity = minCapacity(guard, liveMatch, liveData);
  funded.outputs[1]!.lock = liveTreasury;
  funded.outputs[1]!.capacity = minCapacity(liveTreasury, undefined, new Uint8Array());
  funded.outputsData[0] = ccc.hexFrom(liveData);
  const txHash = await signer.sendTransaction(funded);
  requestWalletRefresh();
  return {
    ...room,
    matchId: typeId,
    hostLockHash: hostHash,
    hostLock: lockRef(host),
    matchOutPoint: { txHash, index: '0x0' },
    treasuryOutPoint: { txHash, index: '0x1' },
    deadlineAt: Number(deadlineMs),
    feed: [
      {
        id: `${Date.now()}`,
        text: 'Match opening on chain.',
        good: true,
      },
      ...room.feed,
    ].slice(0, 8),
  };
}

/**
 * Locks the entry fee in a bid cell. It locks to itself, records when it may be refunded, and
 * is spent by the steal without another signature. Before it is sent, the player's device solves
 * the crown's proof of work for this exact transaction, so every entry (and so every road) costs
 * some computing.
 */
export async function lockBid(
  signer: Signer,
  room: CrownRoom,
  session: SessionKey,
  onStatus?: (message: string) => void,
): Promise<CrownRoom> {
  const located = await locateMatch(signer.client, room);
  if (located.moved) throw new MatchMovedError(located.room);
  const player = await lockOf(signer);
  const match = located.cell;
  const matchTypeHash = match.cellOutput.type?.hash();
  if (!matchTypeHash) throw new Error('The match cell has no type script.');
  const current = readMatch(match);
  const bidScript = getSuddenDeathBidScript(matchTypeHash, player.hash());
  const lock = getSuddenDeathBidLock(bidScript);
  const key = hexToBytes(session.lock.hash());
  const data = encodeBidData(player, current.deadlineMs + BigInt(REFUND_GRACE_MS), 0n, key);
  // Room for the fee and the steal's miner fee. The key cell, made alongside, pays for the seals.
  const capacity = minCapacity(lock, bidScript, data) + current.fee + MAX_TX_FEE;
  const tx = ccc.Transaction.from({
    outputs: [
      ccc.CellOutput.from({ capacity, lock, type: bidScript }),
      ccc.CellOutput.from({ capacity: keyCellCapacity(session.lock, player), lock: session.lock }),
    ],
    outputsData: [ccc.hexFrom(data), '0x'],
    cellDeps: [...getSuddenDeathCellDeps(), ccc.CellDep.from({ outPoint: match.outPoint, depType: 'code' })],
  });
  let txHash: string;
  try {
    const funded = await payFee(signer, tx);
    // The work is bound to this transaction's first input, so it can only be used for this entry.
    const first = funded.inputs[0];
    if (!first) throw new Error('The entry could not be funded.');
    onStatus?.('Proving work for your entry…');
    const nonce = await solvePow(
      hexToBytes(matchTypeHash),
      hexToBytes(player.hash()),
      first.previousOutput.toBytes(),
      current.powBits,
      (tries) => onStatus?.(`Proving work for your entry… ${Math.round(tries / 1000)}k tries`),
    );
    funded.outputsData[0] = ccc.hexFrom(encodeBidData(player, current.deadlineMs + BigInt(REFUND_GRACE_MS), nonce, key));
    onStatus?.('Paying your entry…');
    txHash = await signer.sendTransaction(funded);
    requestWalletRefresh();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/out ?point|resolve|unknown cell|CellNotFound/i.test(message)) {
      const again = await locateMatch(signer.client, located.room);
      throw new MatchMovedError(again.moved ? again.room : located.room);
    }
    throw error;
  }
  return {
    ...located.room,
    bidOutPoint: { txHash, index: '0x0' },
    feed: [
      {
        id: `${Date.now()}`,
        text: 'Entry locked.',
        good: true,
      },
      ...room.feed,
    ].slice(0, 8),
  };
}

/**
 * Submits a run as a steal. Nobody signs it: the match cell, treasury and bid are all proxy
 * locked, and the match script replays the tape to decide. `run.score` is what the wasm build
 * said; the chain recomputes it and rejects the transaction if they differ.
 */
export async function stealCrown(
  client: ccc.Client,
  room: CrownRoom,
  run: PlayedRun,
  onStatus?: (message: string) => void,
): Promise<{ room: CrownRoom; txHash: string; owner: ccc.Script }> {
  const located = await locateMatch(client, room);
  const working = located.room;
  if (!working.treasuryOutPoint || !working.bidOutPoint) {
    throw new Error('Lock an entry before submitting a run.');
  }
  const match = located.cell;
  const treasury = await liveCell(client, working.treasuryOutPoint);
  const bid = await waitLive(client, working.bidOutPoint, onStatus);
  const current = readMatch(match);
  const postmark = await postmarkOf(client, match);
  // The king this steal replaces is certified if their steal landed on time. The script checks it.
  const certified = certifiedAfter(current, postmark.landedMs);
  // The run sealed into the entry: the laps the script will replay. The entry landed when the last
  // lap was sealed, which closes that lap's window and opens the grab's.
  const sealed = decodeEntryRun(hexToBytes(bid.outputData));
  if (sealed.laps === 0 || sealed.laps !== run.laps.length) {
    throw new Error('Seal your laps before grabbing the crown.');
  }
  const bidLanded = await landedBlock(client, bid.outPoint.txHash);
  if (!bidLanded) throw new Error('Your last seal is still confirming. Give it a few seconds.');
  if (!lapOnTime(sealed.lapStartMs, bidLanded.landedMs) || Date.now() > Number(bidLanded.landedMs) + LAP_WINDOW_MS) {
    throw new RoadExpiredError();
  }
  const owner = ownerScriptOf(bid.outputData);
  if (sameHash(owner.hash(), bytesToHex(current.king))) {
    throw new Error('You already hold the crown. Someone has to take it from you first.');
  }
  if (BigInt(run.score) <= current.kingScore) {
    throw new RunBeatenError(run.score, Number(current.kingScore));
  }
  const nextDeadline = BigInt(shrunkDeadline(Number(current.deadlineMs), current.round));
  const next = encodeMatchCell({
    ...current,
    round: current.round + 1,
    deadlineMs: nextDeadline,
    pot: current.pot + current.fee,
    king: hexToBytes(owner.hash()),
    kingScore: BigInt(run.score),
    landByMs: landBy(current.deadlineMs, bidLanded.landedMs),
    certified: certified.king,
    certifiedScore: certified.score,
  });
  const matchType = match.cellOutput.type;
  if (!matchType) throw new Error('The match cell has no type script.');
  const available = BigInt(bid.cellOutput.capacity) - current.fee;
  if (available - MAX_TX_FEE <= 0n) {
    throw new Error('The entry cell is smaller than the entry fee and the relay fee.');
  }
  const tx = ccc.Transaction.from({
    inputs: [
      ccc.CellInput.from({ previousOutput: match.outPoint, since: 0 }),
      ccc.CellInput.from({ previousOutput: treasury.outPoint, since: 0 }),
      ccc.CellInput.from({ previousOutput: bid.outPoint, since: 0 }),
    ],
    outputs: [
      ccc.CellOutput.from({ capacity: match.cellOutput.capacity, lock: match.cellOutput.lock, type: matchType }),
      ccc.CellOutput.from({
        capacity: BigInt(treasury.cellOutput.capacity) + current.fee,
        lock: treasury.cellOutput.lock,
      }),
      ccc.CellOutput.from({ capacity: available, lock: owner }),
    ],
    outputsData: [ccc.hexFrom(next), '0x', '0x'],
    cellDeps: getSuddenDeathCellDeps(),
    // Both postmarks: the match cell's (who is certified) and the entry's (when the last lap was sealed).
    headerDeps: [...new Set([postmark.blockHash, bidLanded.blockHash])],
  });
  tx.setWitnessArgsAt(0, { inputType: ccc.hexFrom(runWitness(run.laps)) });
  tx.outputs[2]!.capacity = available - sizedFee(tx);
  onStatus?.('Sending your run…');
  const txHash = await client.sendTransaction(tx);
  requestWalletRefresh();
  const moved = applySteal(
    { ...working, bidOutPoint: null, deadlineAt: Number(current.deadlineMs) },
    run.score,
    'You',
    `${run.laps.length} laps, ${run.laps.reduce((sum, lap) => sum + lap.tape.length / 3, 0)} moves, replayed on chain`,
  );
  const seals = moved.seals.slice();
  if (seals[0]) seals[0] = { ...seals[0], txHash };
  return {
    txHash,
    owner,
    room: {
      ...moved,
      deadlineAt: Number(nextDeadline),
      seals,
      kingLock: lockRef(owner),
      kingHash: owner.hash(),
      matchOutPoint: { txHash, index: '0x0' },
      treasuryOutPoint: { txHash, index: '0x1' },
    },
  };
}

/**
 * Pays the crown out. Anyone may send it once the chain's median time passes the deadline, and
 * nobody signs it: the match, the pot and the entries are all unlocked by their scripts, and the
 * fee comes out of the host's share. The pot goes to the last king whose steal landed on time,
 * every entry included here goes back to its owner, and the host gets the rest.
 *
 * `closerLockHash` is whoever sends it. When they are already paid by this close (the king, or an
 * entry owner), the close adds the closer's reward to their payout, from the host's share.
 */
export async function closeCrown(
  client: ccc.Client,
  room: CrownRoom,
  closerLockHash?: string | null,
): Promise<{ room: CrownRoom; txHash: string }> {
  const located = await locateMatch(client, room);
  const working = located.room;
  if (!working.treasuryOutPoint || !working.hostLockHash) {
    throw new Error('This crown is not on chain yet.');
  }
  const match = located.cell;
  const treasury = await liveCell(client, working.treasuryOutPoint);
  const current = readMatch(match);
  const postmark = await postmarkOf(client, match);
  const matchType = match.cellOutput.type;
  if (!matchType) throw new Error('The match cell has no type script.');
  const argBytes = ccc.bytesFrom(matchType.args);
  if (argBytes.length !== 64) throw new Error('Match type args are missing the host hash.');
  const hostHash = ccc.hexFrom(argBytes.slice(32)).toLowerCase();
  const winner = winnerOf(current, postmark.landedMs);
  const winnerHash = winner ? bytesToHex(winner).toLowerCase() : null;
  const hostWins = winnerHash == null || winnerHash === hostHash;
  const matchCap = BigInt(match.cellOutput.capacity);
  const treasuryCap = BigInt(treasury.cellOutput.capacity);

  const bids = await findBids(client, matchType.hash());
  if (bids.length === 0 && working.bidOutPoint) {
    const only = await readLiveCell(client, working.bidOutPoint);
    if (only) bids.push(only);
  }
  // One payout per lock: each owner's entries, the pot for the winner, the rest for the host.
  const payouts = new Map<string, { script: ccc.Script | null; amount: bigint }>();
  const add = (hash: string, amount: bigint, script: ccc.Script | null = null) => {
    const key = hash.toLowerCase();
    const prev = payouts.get(key);
    if (prev) {
      prev.amount += amount;
      prev.script ??= script;
    } else {
      payouts.set(key, { script, amount });
    }
  };
  for (const bid of bids) {
    const owner = ownerScriptOf(bid.outputData);
    add(owner.hash(), BigInt(bid.cellOutput.capacity), owner);
  }
  if (!hostWins && winnerHash) add(winnerHash, current.pot);
  add(hostHash, hostWins ? matchCap + treasuryCap : matchCap + treasuryCap - current.pot);

  for (const [hash, payout] of payouts) {
    if (payout.script) continue;
    const saved = hash === hostHash ? working.hostLock : working.kingLock;
    payout.script = await lockFromHistory(client, match, hash, saved);
  }
  const closer = closerLockHash?.toLowerCase();
  const tipped = closer && closer !== hostHash && payouts.has(closer) ? closer : null;
  if (tipped) payouts.get(tipped)!.amount += CLOSER_REWARD;

  const keys = [...payouts.keys()];
  const hostIndex = keys.indexOf(hostHash);
  const tx = ccc.Transaction.from({
    inputs: [
      ccc.CellInput.from({ previousOutput: match.outPoint, since: sinceFor(current.deadlineMs) }),
      ccc.CellInput.from({ previousOutput: treasury.outPoint, since: sinceFor(current.deadlineMs) }),
      ...bids.map((bid) => ccc.CellInput.from({ previousOutput: bid.outPoint, since: 0 })),
    ],
    outputs: keys.map((key) => {
      const payout = payouts.get(key)!;
      const amount = key === hostHash && tipped ? payout.amount - CLOSER_REWARD : payout.amount;
      return ccc.CellOutput.from({ capacity: amount, lock: payout.script! });
    }),
    outputsData: keys.map(() => '0x'),
    cellDeps: getSuddenDeathCellDeps(),
    headerDeps: [postmark.blockHash],
  });
  tx.outputs[hostIndex]!.capacity -= sizedFee(tx);
  const txHash = await client.sendTransaction(tx);
  requestWalletRefresh();
  return {
    txHash,
    room: {
      ...working,
      status: 'settled',
      seals: [{ id: `${Date.now()}`, label: 'Close', detail: 'Cleanup sent.', txHash }, ...working.seals].slice(0, 8),
    },
  };
}

/**
 * A full lock script, from its hash. The match cell only stores hashes, but every steal paid the
 * stealer's change to their lock and the open paid the host's change to theirs, so walking the
 * match back through its own transactions finds anyone it names.
 */
async function lockFromHistory(
  client: ccc.Client,
  match: ccc.Cell,
  hash: string,
  saved: LockRef | null,
): Promise<ccc.Script> {
  if (saved && sameHash(ccc.Script.from(saved).hash(), hash)) return ccc.Script.from(saved);
  let txHash: string | undefined = match.outPoint.txHash;
  for (let hop = 0; txHash && hop < 160; hop += 1) {
    const tx: ccc.Transaction | undefined = (await client.getTransaction(txHash))?.transaction;
    if (!tx) break;
    const found = tx.outputs.find((output) => sameHash(output.lock.hash(), hash));
    if (found) return found.lock;
    txHash = tx.inputs[0]?.previousOutput.txHash;
  }
  throw new Error('A player’s lock could not be read from this crown’s history.');
}

/** Live entries for a match, found by the bid type's match-hash prefix. */
async function findBids(client: ccc.Client, matchTypeHash: string): Promise<ccc.Cell[]> {
  const bids: ccc.Cell[] = [];
  for await (const cell of client.findCells(
    {
      script: ccc.Script.from({
        codeHash: suddenDeathBidType.codeHash,
        hashType: suddenDeathBidType.hashType,
        args: matchTypeHash,
      }),
      scriptType: 'type',
      scriptSearchMode: 'prefix',
      withData: true,
    },
    'asc',
    50,
  )) {
    const args = ccc.bytesFrom(cell.cellOutput.type?.args ?? '0x');
    if (args.length === 64) bids.push(cell);
  }
  return bids;
}

/**
 * Returns an unused entry to its owner after its refund time. Needs no signature and no match
 * cell, so it works for an entry left out of the close, or for a crown nobody ever closed.
 * The chain only allows it once its median time has passed the refund time.
 */
export async function expireBid(client: ccc.Client, point: OutPointRef): Promise<string> {
  const bid = await liveCell(client, point);
  const { owner, refundAfterMs } = decodeBidData(hexToBytes(bid.outputData));
  const capacity = BigInt(bid.cellOutput.capacity);
  const tx = ccc.Transaction.from({
    inputs: [ccc.CellInput.from({ previousOutput: bid.outPoint, since: sinceFor(refundAfterMs) })],
    outputs: [ccc.CellOutput.from({ capacity, lock: owner })],
    outputsData: ['0x'],
    cellDeps: getSuddenDeathCellDeps(),
  });
  tx.outputs[0]!.capacity = capacity - sizedFee(tx);
  return client.sendTransaction(tx);
}

/** When an entry can be returned, read from its own data. */
export async function bidRefundAt(client: ccc.Client, point: OutPointRef): Promise<number | null> {
  const bid = await readLiveCell(client, point);
  if (!bid) return null;
  return Number(decodeBidData(hexToBytes(bid.outputData)).refundAfterMs);
}
