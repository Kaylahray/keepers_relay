import { ccc } from '@ckb-ccc/core';
import {
  bytesToHex,
  decodeBidData,
  decodeMatchCell,
  encodeBidData,
  encodeMatchCell,
  hexToBytes,
  REFUND_GRACE_MS,
  runWitness,
  shrunkDeadline,
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
/** The most a steal or refund may take from an entry for the miner. The scripts enforce it. */
const MAX_TX_FEE = 10_000_000n;
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
export type PlayedRun = { tape: Uint8Array; score: number };

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
      round: 1,
      deadlineMs,
      fee: room.feeShannons,
      pot: 0n,
      king: ZERO_32,
      game,
      treasury: hexToBytes(treasury.hash()),
      bidCode: hexToBytes(suddenDeathBidType.codeHash),
      kingScore: 0n,
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
 * is spent by the steal without another signature.
 */
export async function lockBid(signer: Signer, room: CrownRoom): Promise<CrownRoom> {
  const located = await locateMatch(signer.client, room);
  if (located.moved) throw new MatchMovedError(located.room);
  const player = await lockOf(signer);
  const match = located.cell;
  const matchTypeHash = match.cellOutput.type?.hash();
  if (!matchTypeHash) throw new Error('The match cell has no type script.');
  const current = decodeMatchCell(hexToBytes(match.outputData));
  const bidScript = getSuddenDeathBidScript(matchTypeHash, player.hash());
  const lock = getSuddenDeathBidLock(bidScript);
  const data = encodeBidData(player, current.deadlineMs + BigInt(REFUND_GRACE_MS));
  const capacity = minCapacity(lock, bidScript, data) + current.fee + MAX_TX_FEE;
  const tx = ccc.Transaction.from({
    outputs: [ccc.CellOutput.from({ capacity, lock, type: bidScript })],
    outputsData: [ccc.hexFrom(data)],
    cellDeps: [...getSuddenDeathCellDeps(), ccc.CellDep.from({ outPoint: match.outPoint, depType: 'code' })],
  });
  let txHash: string;
  try {
    txHash = await signer.sendTransaction(await payFee(signer, tx));
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
  const current = decodeMatchCell(hexToBytes(match.outputData));
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
  });
  tx.setWitnessArgsAt(0, { inputType: ccc.hexFrom(runWitness(run.tape)) });
  tx.outputs[2]!.capacity = available - sizedFee(tx);
  onStatus?.('Sending your run…');
  const txHash = await client.sendTransaction(tx);
  requestWalletRefresh();
  const moved = applySteal(
    { ...working, bidOutPoint: null, deadlineAt: Number(current.deadlineMs) },
    run.score,
    'You',
    `Run of ${run.tape.length / 3} moves, replayed on chain`,
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
 * Pays the crown out. Anyone may send it once the chain's median time passes the deadline:
 * the king gets the pot, the host the rest, every entry included here goes back to its owner.
 */
export async function closeCrown(signer: Signer, room: CrownRoom): Promise<{ room: CrownRoom; txHash: string }> {
  const located = await locateMatch(signer.client, room);
  const working = located.room;
  if (!working.treasuryOutPoint || !working.hostLockHash) {
    throw new Error('This crown is not on chain yet.');
  }
  const match = located.cell;
  const treasury = await liveCell(signer.client, working.treasuryOutPoint);
  const current = decodeMatchCell(hexToBytes(match.outputData));
  const matchType = match.cellOutput.type;
  if (!matchType) throw new Error('The match cell has no type script.');
  const argBytes = ccc.bytesFrom(matchType.args);
  if (argBytes.length !== 64) throw new Error('Match type args are missing the host hash.');
  const hostHash = ccc.hexFrom(argBytes.slice(32));
  const kingHash = bytesToHex(current.king);
  const kingIsEmpty = current.king.every((byte) => byte === 0);
  const hostIsKing = !kingIsEmpty && sameHash(kingHash, hostHash);
  const matchCap = BigInt(match.cellOutput.capacity);
  const treasuryCap = BigInt(treasury.cellOutput.capacity);
  const hostShare = kingIsEmpty ? matchCap + treasuryCap : matchCap + treasuryCap - current.pot;
  const bids = await findBids(signer.client, matchType.hash());
  if (bids.length === 0 && working.bidOutPoint) {
    const only = await readLiveCell(signer.client, working.bidOutPoint);
    if (only) bids.push(only);
  }
  const groups = new Map<string, { script: ccc.Script; total: bigint }>();
  for (const bid of bids) {
    const owner = ownerScriptOf(bid.outputData);
    const hash = owner.hash().toLowerCase();
    const prev = groups.get(hash);
    const capacity = BigInt(bid.cellOutput.capacity);
    if (prev) prev.total += capacity;
    else groups.set(hash, { script: owner, total: capacity });
  }
  const inputs = [
    ccc.CellInput.from({ previousOutput: match.outPoint, since: sinceFor(current.deadlineMs) }),
    ccc.CellInput.from({ previousOutput: treasury.outPoint, since: sinceFor(current.deadlineMs) }),
    ...bids.map((bid) => ccc.CellInput.from({ previousOutput: bid.outPoint, since: 0 })),
  ];
  const outputs: ccc.CellOutput[] = [];
  const outputsData: ccc.Hex[] = [];
  for (const [hash, group] of groups) {
    let pay = group.total;
    if (!kingIsEmpty && sameHash(hash, kingHash)) pay += current.pot;
    if (sameHash(hash, hostHash)) pay += hostShare;
    outputs.push(ccc.CellOutput.from({ capacity: pay, lock: group.script }));
    outputsData.push('0x');
  }
  if (!kingIsEmpty && !hostIsKing && !groups.has(kingHash.toLowerCase())) {
    const kingLock = await kingLockOf(signer.client, match, kingHash, working.kingLock);
    outputs.push(ccc.CellOutput.from({ capacity: current.pot, lock: kingLock }));
    outputsData.push('0x');
  }
  if (!groups.has(hostHash.toLowerCase())) {
    const connected = await lockOf(signer);
    const hostScript = working.hostLock
      ? ccc.Script.from(working.hostLock)
      : sameHash(connected.hash(), hostHash)
        ? connected
        : null;
    if (!hostScript) {
      throw new Error('This crown does not have the host lock saved. Close it from the host wallet.');
    }
    const pay = kingIsEmpty || hostIsKing ? matchCap + treasuryCap : hostShare;
    outputs.push(ccc.CellOutput.from({ capacity: pay, lock: hostScript }));
    outputsData.push('0x');
  }
  const tx = ccc.Transaction.from({ inputs, outputs, outputsData, cellDeps: getSuddenDeathCellDeps() });
  const txHash = await signer.sendTransaction(await payFee(signer, tx));
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
 * The king's full lock script. The match cell only stores its hash, but the steal that wrote
 * this cell paid the king's change to that lock, so anyone can close without having been told it.
 */
async function kingLockOf(
  client: ccc.Client,
  match: ccc.Cell,
  kingHash: string,
  saved: LockRef | null,
): Promise<ccc.Script> {
  if (saved && sameHash(ccc.Script.from(saved).hash(), kingHash)) return ccc.Script.from(saved);
  const steal = await client.getTransaction(match.outPoint.txHash);
  const found = steal?.transaction.outputs.find((output) => sameHash(output.lock.hash(), kingHash));
  if (!found) throw new Error('The king’s lock could not be read from the steal that crowned them.');
  return found.lock;
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
