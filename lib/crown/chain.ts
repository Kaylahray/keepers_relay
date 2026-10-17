import { ccc } from '@ckb-ccc/core';
import {
  bytesToHex,
  decodeMatchCell,
  encodeMatchCell,
  hexToBytes,
  shrunkDeadline,
  merkleRoot,
  stealProof,
  type BankQuestion,
} from '@/lib/sudden-death/codec';
import { applySteal, DEFAULT_DURATION_MS, type CrownRoom, type LockRef, type OutPointRef } from '@/lib/crown/rooms';
import { requestWalletRefresh } from '@/lib/wallet-refresh';
import { REGISTRY_FEE_RATE, suddenDeathBidType } from '@/lib/registry/config';
import {
  getSuddenDeathBidScript,
  getSuddenDeathCellDeps,
  getSuddenDeathMatchScript,
  getSuddenDeathProxyLock,
  getSuddenDeathTreasuryScript,
} from '@/lib/registry/scripts';

const SHANNONS_PER_CKB = 100_000_000n;
const SINCE_ABSOLUTE = 0x4000_0000_0000_0000n;
const MAX_TX_FEE = 10_000_000n;
const ZERO_32 = new Uint8Array(32);
/** JoyID time is part of the signed deadline. Without this slack the 12s clock is already gone when the question appears. */

/** The bid was signed against a match cell a steal has already consumed. */
export class MatchMovedError extends Error {
  readonly room: CrownRoom;

  constructor(room: CrownRoom) {
    super('The match moved on. Approve once more to enter.');
    this.name = 'MatchMovedError';
    this.room = room;
  }
}

type Signer = ccc.Signer;

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

async function liveCell(signer: Signer, point: OutPointRef): Promise<ccc.Cell> {
  const cell = await signer.client.getCell(point);
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

function sinceFor(deadlineMs: bigint): bigint {
  return SINCE_ABSOLUTE | (deadlineMs / 1000n);
}

function pointOf(cell: ccc.Cell): OutPointRef {
  return { txHash: cell.outPoint.txHash, index: ccc.numToHex(cell.outPoint.index) };
}

function ownerScriptOf(data: ccc.HexLike): ccc.Script {
  const raw = ccc.bytesFrom(data);
  if (raw[0] !== 1 || raw.length < 2) {
    throw new Error('This bid does not store an owner script.');
  }
  return ccc.Script.fromBytes(raw.slice(1));
}

async function findOne(
  signer: Signer,
  script: ccc.Script,
  scriptType: 'lock' | 'type',
): Promise<ccc.Cell | null> {
  for await (const cell of signer.client.findCells(
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
  signer: Signer,
  room: CrownRoom,
): Promise<{ room: CrownRoom; cell: ccc.Cell; moved: boolean }> {
  if (!room.matchOutPoint || !room.matchId || !room.hostLockHash) {
    throw new Error('Start the clock before locking a bid.');
  }
  let status: string | null = null;
  try {
    status = (await signer.client.getTransaction(room.matchOutPoint.txHash))?.status ?? null;
  } catch {
    status = null;
  }
  if (status === 'committed' || status == null) {
    try {
      const stored = await signer.client.getCell(room.matchOutPoint);
      if (stored?.cellOutput.type) return { room, cell: stored, moved: false };
    } catch {
      if (status === 'committed') status = null;
    }
  }
  if (status !== 'rejected') {
    throw new Error('The match cell is still confirming. Wait a few seconds, then try again.');
  }
  const type = getSuddenDeathMatchScript(concatArgs(room.matchId, room.hostLockHash));
  const cell = await findOne(signer, type, 'type');
  if (!cell?.cellOutput.type) {
    throw new Error('The match cell is still confirming. Wait a few seconds, then try again.');
  }
  const matchTypeHash = cell.cellOutput.type.hash();
  const treasury = await findOne(signer, getSuddenDeathTreasuryScript(matchTypeHash), 'lock');
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

/** The connected wallet signs every input it owns. A different host lock is left for the desk. */
export async function signOwned(
  signer: Signer,
  tx: ccc.Transaction,
  hostLockHash: string,
): Promise<{ txHash: string | null; pending: string | null }> {
  const mine = (await lockOf(signer)).hash();
  if (sameHash(mine, hostLockHash)) {
    const txHash = await signer.sendTransaction(tx);
    requestWalletRefresh();
    return { txHash, pending: null };
  }
  const signed = await signer.signOnlyTransaction(tx);
  return { txHash: null, pending: ccc.hexFrom(signed.toBytes()) };
}

export async function finishPending(signer: Signer, room: CrownRoom): Promise<CrownRoom> {
  if (!room.pendingTx) throw new Error('Nothing is waiting for a signature.');
  const tx = ccc.Transaction.fromBytes(room.pendingTx);
  const signed = await signer.signOnlyTransaction(await signer.prepareTransaction(tx));
  const txHash = await signer.client.sendTransaction(signed);
  requestWalletRefresh();
  if (room.pendingKind === 'close') {
    return settled(room, txHash);
  }
  const moved = applySteal({ ...room, pendingTx: null, pendingKind: null, bidOutPoint: null }, 'Host signed the match cell.');
  const seals = moved.seals.slice();
  if (seals[0]) seals[0] = { ...seals[0], txHash };
  return {
    ...moved,
    seals,
    matchOutPoint: { txHash, index: '0x0' },
    treasuryOutPoint: { txHash, index: '0x1' },
  };
}

export async function openMatch(
  signer: Signer,
  room: CrownRoom,
): Promise<CrownRoom> {
  const host = await lockOf(signer);
  const hostHash = host.hash();
  const deadlineMs = BigInt(Date.now() + (room.durationMs || DEFAULT_DURATION_MS));
  const matchScript = getSuddenDeathMatchScript(concatArgs(ccc.hexFrom(ZERO_32), hostHash));
  const treasuryScript = getSuddenDeathTreasuryScript(ccc.hexFrom(ZERO_32));
  const placeholderGuard = getSuddenDeathProxyLock(ccc.hexFrom(ZERO_32));
  const matchData = encodeMatchCell({
    round: 1,
    deadlineMs,
    fee: room.feeShannons,
    pot: 0n,
    king: ZERO_32,
    root: merkleRoot(ZERO_32, room.questions),
    treasury: hexToBytes(treasuryScript.hash()),
    bidCode: hexToBytes(suddenDeathBidType.codeHash),
  });
  const matchCap = minCapacity(placeholderGuard, matchScript, matchData);
  const treasuryCap = minCapacity(treasuryScript, undefined, new Uint8Array());
  const tx = ccc.Transaction.from({
    outputs: [
      ccc.CellOutput.from({ capacity: matchCap, lock: placeholderGuard, type: matchScript }),
      ccc.CellOutput.from({ capacity: treasuryCap, lock: treasuryScript }),
    ],
    outputsData: [ccc.hexFrom(matchData), '0x'],
    cellDeps: getSuddenDeathCellDeps(),
  });
  const funded = await payFee(signer, tx);
  const typeId = ccc.hashTypeId(funded.inputs[0]!, 0);
  const liveMatch = getSuddenDeathMatchScript(concatArgs(typeId, hostHash));
  const matchTypeHash = liveMatch.hash();
  const liveTreasury = getSuddenDeathTreasuryScript(matchTypeHash);
  const guard = getSuddenDeathProxyLock(matchTypeHash);
  const root = merkleRoot(hexToBytes(typeId), room.questions);
  const liveData = encodeMatchCell({
    round: 1,
    deadlineMs,
    fee: room.feeShannons,
    pot: 0n,
    king: ZERO_32,
    root,
    treasury: hexToBytes(liveTreasury.hash()),
    bidCode: hexToBytes(suddenDeathBidType.codeHash),
  });
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
        text: 'Match cell is in the mempool. The clock starts from the deadline written there.',
        good: true,
      },
      ...room.feed,
    ].slice(0, 8),
  };
}

export async function lockBid(signer: Signer, room: CrownRoom): Promise<CrownRoom> {
  const located = await locateMatch(signer, room);
  if (located.moved) throw new MatchMovedError(located.room);
  const player = await lockOf(signer);
  const match = located.cell;
  const matchTypeHash = match.cellOutput.type?.hash();
  if (!matchTypeHash) throw new Error('The match cell has no type script.');
  const current = decodeMatchCell(hexToBytes(match.outputData));
  const guard = getSuddenDeathProxyLock(matchTypeHash);
  const bidScript = getSuddenDeathBidScript(matchTypeHash, player.hash());
  const data = new Uint8Array(1 + player.toBytes().length);
  data[0] = 1;
  data.set(player.toBytes(), 1);
  const capacity = minCapacity(guard, bidScript, data) + current.fee + MAX_TX_FEE;
  const tx = ccc.Transaction.from({
    outputs: [ccc.CellOutput.from({ capacity, lock: guard, type: bidScript })],
    outputsData: [ccc.hexFrom(data)],
    cellDeps: [
      ...getSuddenDeathCellDeps(),
      ccc.CellDep.from({ outPoint: match.outPoint, depType: 'code' }),
    ],
  });
  let txHash: string;
  try {
    txHash = await signer.sendTransaction(await payFee(signer, tx));
    requestWalletRefresh();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/out ?point|resolve|unknown cell|CellNotFound/i.test(message)) {
      const again = await locateMatch(signer, located.room);
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
        text: 'Bid is locked. A correct answer spends it without another signature.',
        good: true,
      },
      ...room.feed,
    ].slice(0, 8),
  };
}

export async function stealCrown(
  signer: Signer,
  room: CrownRoom,
  preparedProof?: Uint8Array,
): Promise<{ room: CrownRoom; sent: boolean }> {
  const located = await locateMatch(signer, room);
  const working = located.room;
  if (!working.treasuryOutPoint || !working.bidOutPoint) {
    throw new Error('Lock an entry bid before answering.');
  }
  const match = located.cell;
  const treasury = await liveCell(signer, working.treasuryOutPoint);
  const bid = await liveCell(signer, working.bidOutPoint);
  const current = decodeMatchCell(hexToBytes(match.outputData));
  const questionIndex = current.round - 1;
  const question: BankQuestion | undefined = working.questions[questionIndex];
  if (!question) {
    throw new Error('The bank is finished. The king holds until cleanup.');
  }
  const matchId = hexToBytes(working.matchId ?? '');
  const proof = preparedProof ?? stealProof(matchId, working.questions, questionIndex);
  const nextDeadline = BigInt(shrunkDeadline(Number(current.deadlineMs), current.round));
  const owner = ownerScriptOf(bid.outputData);
  const next = encodeMatchCell({
    ...current,
    round: current.round + 1,
    deadlineMs: nextDeadline,
    pot: current.pot + current.fee,
    king: hexToBytes(owner.hash()),
  });
  const matchType = match.cellOutput.type;
  if (!matchType) throw new Error('The match cell has no type script.');
  const bidCap = BigInt(bid.cellOutput.capacity);
  const change = bidCap - current.fee - MAX_TX_FEE;
  if (change <= 0n) {
    throw new Error('The bid cell is smaller than the entry fee and the relay fee.');
  }
  const tx = ccc.Transaction.from({
    inputs: [
      ccc.CellInput.from({ previousOutput: match.outPoint, since: 0 }),
      ccc.CellInput.from({ previousOutput: treasury.outPoint, since: 0 }),
      ccc.CellInput.from({ previousOutput: bid.outPoint, since: 0 }),
    ],
    outputs: [
      ccc.CellOutput.from({
        capacity: match.cellOutput.capacity,
        lock: match.cellOutput.lock,
        type: matchType,
      }),
      ccc.CellOutput.from({
        capacity: BigInt(treasury.cellOutput.capacity) + current.fee,
        lock: treasury.cellOutput.lock,
      }),
      ccc.CellOutput.from({ capacity: change, lock: owner }),
    ],
    outputsData: [ccc.hexFrom(next), '0x', '0x'],
    cellDeps: getSuddenDeathCellDeps(),
  });
  tx.setWitnessArgsAt(0, { inputType: ccc.hexFrom(proof) });
  const txHash = await signer.client.sendTransaction(tx);
  requestWalletRefresh();
  return {
    sent: true,
    room: {
      ...noteSteal(working, txHash, bytesToHex(proof), Number(nextDeadline)),
      kingLock: lockRef(owner),
    },
  };
}

function noteSteal(room: CrownRoom, txHash: string, proofHex: string, deadlineAt: number): CrownRoom {
  const moved = applySteal(
    { ...room, pendingTx: null, pendingKind: null, bidOutPoint: null },
    `Proof ${proofHex.slice(0, 18)}…`,
  );
  const seals = moved.seals.slice();
  if (seals[0]) seals[0] = { ...seals[0], txHash };
  return {
    ...moved,
    deadlineAt,
    seals,
    matchOutPoint: { txHash, index: '0x0' },
    treasuryOutPoint: { txHash, index: '0x1' },
  };
}

export async function closeCrown(signer: Signer, room: CrownRoom): Promise<{ room: CrownRoom; sent: boolean }> {
  const located = await locateMatch(signer, room);
  const working = located.room;
  if (!working.treasuryOutPoint || !working.hostLockHash) {
    throw new Error('This crown is not on chain yet.');
  }
  const match = located.cell;
  const treasury = await liveCell(signer, working.treasuryOutPoint);
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
  const bids: ccc.Cell[] = [];
  for await (const cell of signer.client.findCells(
    {
      script: ccc.Script.from({
        codeHash: suddenDeathBidType.codeHash,
        hashType: suddenDeathBidType.hashType,
        args: matchType.hash(),
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
  if (bids.length === 0 && working.bidOutPoint) {
    const only = await signer.client.getCell(working.bidOutPoint);
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
    if (!working.kingLock) throw new Error('The king lock was not saved with the steal.');
    outputs.push(ccc.CellOutput.from({ capacity: current.pot, lock: ccc.Script.from(working.kingLock) }));
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
  const tx = ccc.Transaction.from({
    inputs,
    outputs,
    outputsData,
    cellDeps: getSuddenDeathCellDeps(),
  });
  const txHash = await signer.sendTransaction(await payFee(signer, tx));
  requestWalletRefresh();
  return { sent: true, room: settled(working, txHash) };
}

function settled(room: CrownRoom, txHash: string): CrownRoom {
  return {
    ...room,
    pendingTx: null,
    status: 'settled',
    seals: [
      { id: `${Date.now()}`, label: 'Close', detail: 'Cleanup sent.', txHash },
      ...room.seals,
    ].slice(0, 8),
  };
}
