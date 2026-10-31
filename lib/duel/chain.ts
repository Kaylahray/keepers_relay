import { ccc } from '@ckb-ccc/core';
import { readLiveCell } from '@/lib/ckb/live-cell';
import { keyCellCapacity, type SessionKey } from '@/lib/crown/chain';
import { getSuddenDeathProxyLock } from '@/lib/crown/scripts';
import { PASS_SHOT, replay, type ArtilleryState, type Shot, type ShotRecord } from '@/lib/duel/artillery';
import {
  ARTILLERY_MAX_LEN,
  decodeDuel,
  decodeRacer,
  duelSeed,
  duelWind,
  encodeDuel,
  encodeRacer,
  KIND_ARTILLERY,
  KIND_RACE,
  MAX_SHOTS,
  newDuel,
  RACE_LEN,
  RACER_LEN,
  STATUS_LIVE,
  STATUS_OPEN,
  type DuelCell,
  type DuelKind,
} from '@/lib/duel/codec';
import {
  bytesToHex,
  ckbHash,
  foldLap,
  hexToBytes,
  LAP_WINDOW_MS,
  lapOnTime,
  MAX_TX_FEE,
  runSeed,
  runWitness,
  SEAL_VERSION,
  type SealedLap,
} from '@/lib/sudden-death/codec';
import {
  artilleryGame,
  duelType,
  REGISTRY_FEE_RATE,
  suddenDeathGame,
  suddenDeathProxyLock,
  type ScriptConfig,
} from '@/lib/registry/config';
import { requestWalletRefresh } from '@/lib/wallet-refresh';

/** Duels on chain: the app's side of `duel-type`. */

export type OutPointRef = { txHash: string; index: string };
type Signer = ccc.Signer;

const SHANNONS_PER_CKB = 100_000_000n;
const ZERO_32 = new Uint8Array(32);
/** Relative timestamp `since`: "this input has waited at least so many seconds since it landed". */
const FEE_PER_KB = 1_000_000n;
/** What a racer cell keeps for the fees of its seals and its submit. */
const RACER_FEES = 1n * SHANNONS_PER_CKB;

function toCellDep(s: ScriptConfig): ccc.CellDep {
  return ccc.CellDep.from({ outPoint: { txHash: s.outPoint.txHash, index: s.outPoint.index }, depType: s.depType });
}

/** Every code cell a duel may run: the duel script, both game scripts and the proxy lock. */
export function duelCellDeps(): ccc.CellDep[] {
  return [toCellDep(duelType), toCellDep(artilleryGame), toCellDep(suddenDeathGame), toCellDep(suddenDeathProxyLock)];
}

export function duelScript(duelId: ccc.HexLike): ccc.Script {
  return ccc.Script.from({ codeHash: duelType.codeHash, hashType: duelType.hashType, args: ccc.hexFrom(duelId) });
}

export function racerScript(duelId: ccc.HexLike, side: 0 | 1): ccc.Script {
  const args = new Uint8Array(33);
  args.set(ccc.bytesFrom(duelId), 0);
  args[32] = side;
  return duelScript(args);
}

function minCapacity(lock: ccc.Script, type: ccc.Script | undefined, dataLength: number): bigint {
  const output = ccc.CellOutput.from({ capacity: 0n, lock, type });
  return (BigInt(output.occupiedSize) + BigInt(dataLength)) * SHANNONS_PER_CKB;
}

/** Miner fee for a transaction nobody signs, from its size. */
function sizedFee(tx: ccc.Transaction): bigint {
  const fee = (BigInt(tx.toBytes().length + 4) * FEE_PER_KB + 1023n) / 1024n;
  return fee > MAX_TX_FEE ? MAX_TX_FEE : fee;
}

async function landedBlock(client: ccc.Client, txHash: string): Promise<{ blockHash: ccc.Hex; landedMs: bigint } | null> {
  const blockHash = (await client.getTransaction(txHash))?.blockHash;
  const header = blockHash ? await client.getHeaderByHash(blockHash) : undefined;
  return blockHash && header ? { blockHash, landedMs: BigInt(header.timestamp) } : null;
}

async function liveDuel(client: ccc.Client, point: OutPointRef): Promise<{ cell: ccc.Cell; duel: DuelCell; duelId: ccc.Hex }> {
  const cell = await readLiveCell(client, point);
  if (!cell) throw new Error('That duel is not on chain right now. Wait for the last move to confirm.');
  const type = cell.cellOutput.type;
  if (!type || ccc.bytesFrom(type.args).length !== 32) throw new Error('That cell is not a duel.');
  return { cell, duel: decodeDuel(hexToBytes(cell.outputData)), duelId: type.args };
}

/** The live cell a session key holds: its key cell, or its racer cell in a race. */
async function sessionCell(signer: ccc.SignerCkbPrivateKey): Promise<ccc.Cell | null> {
  const lock = (await signer.getRecommendedAddressObj()).script;
  for await (const cell of signer.client.findCells({ script: lock, scriptType: 'lock', scriptSearchMode: 'exact', withData: true }, 'desc', 1)) {
    return cell;
  }
  return null;
}

/** What a racer cell needs: itself with its data, and, once handed in, a plain cell for its owner. */
function racerCapacity(session: ccc.Script, owner: ccc.Script, racer: ccc.Script): bigint {
  const own = minCapacity(session, racer, RACER_LEN);
  const back = minCapacity(owner, undefined, 0);
  return (own > back ? own : back) + RACER_FEES;
}

/** Opens a challenge. */
export async function openDuel(
  signer: Signer,
  input: { kind: DuelKind; stake: bigint; timerMs: bigint; opponentLockHash: string | null; session: SessionKey },
): Promise<{ duelId: ccc.Hex; point: OutPointRef }> {
  const owner = (await signer.getRecommendedAddressObj()).script;
  const game = hexToBytes(input.kind === KIND_RACE ? suddenDeathGame.codeHash : artilleryGame.codeHash);
  const data = encodeDuel(
    newDuel({
      kind: input.kind,
      stake: input.stake,
      timerMs: input.timerMs,
      challenger: hexToBytes(owner.hash()),
      opponent: input.opponentLockHash ? hexToBytes(input.opponentLockHash) : null,
      key0: hexToBytes(input.session.lock.hash()),
      game,
    }),
  );
  const fullLength = input.kind === KIND_RACE ? RACE_LEN : ARTILLERY_MAX_LEN;
  // The type id comes from the first input, known only once the wallet funds the transaction.
  const placeholder = duelScript(ZERO_32);
  const placeholderGuard = getSuddenDeathProxyLock(ccc.hexFrom(ZERO_32));
  const keyOutput =
    input.kind === KIND_RACE
      ? ccc.CellOutput.from({
          capacity: racerCapacity(input.session.lock, owner, racerScript(ZERO_32, 0)),
          lock: input.session.lock,
          type: racerScript(ZERO_32, 0),
        })
      : ccc.CellOutput.from({ capacity: keyCellCapacity(input.session.lock, owner), lock: input.session.lock });
  const tx = ccc.Transaction.from({
    outputs: [
      ccc.CellOutput.from({
        capacity: input.stake + minCapacity(placeholderGuard, placeholder, fullLength),
        lock: placeholderGuard,
        type: placeholder,
      }),
      keyOutput,
    ],
    outputsData: [ccc.hexFrom(data), input.kind === KIND_RACE ? ccc.hexFrom(encodeRacer({ laps: 0, lapStartMs: 0n, chain: ZERO_32 })) : '0x'],
    cellDeps: duelCellDeps(),
  });
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  const duelId = ccc.hashTypeId(tx.inputs[0]!, 0);
  const live = duelScript(duelId);
  tx.outputs[0]!.type = live;
  tx.outputs[0]!.lock = getSuddenDeathProxyLock(live.hash());
  if (input.kind === KIND_RACE) tx.outputs[1]!.type = racerScript(duelId, 0);
  const txHash = await signer.sendTransaction(tx);
  requestWalletRefresh();
  return { duelId, point: { txHash, index: '0x0' } };
}

/** Takes an unaccepted challenge back. Only the challenger's wallet can: it signs where the stake goes. */
export async function cancelDuel(signer: Signer, point: OutPointRef): Promise<string> {
  const client = signer.client;
  const { cell, duel } = await liveDuel(client, point);
  if (duel.status !== STATUS_OPEN) throw new Error('Someone already accepted this duel.');
  const owner = (await signer.getRecommendedAddressObj()).script;
  const tx = ccc.Transaction.from({
    inputs: [ccc.CellInput.from({ previousOutput: cell.outPoint, since: 0 })],
    outputs: [ccc.CellOutput.from({ capacity: cell.cellOutput.capacity, lock: owner })],
    outputsData: ['0x'],
    cellDeps: duelCellDeps(),
  });
  // The script needs one of the challenger's own cells in the transaction: their signature.
  await tx.completeInputsAtLeastOne(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  const txHash = await signer.sendTransaction(tx);
  requestWalletRefresh();
  return txHash;
}

/** Accepts a challenge: the opponent's wallet adds the same stake and makes their session key's cell. */
export async function acceptDuel(signer: Signer, point: OutPointRef, session: SessionKey): Promise<OutPointRef> {
  const client = signer.client;
  const { cell, duel, duelId } = await liveDuel(client, point);
  if (duel.status !== STATUS_OPEN) throw new Error('This duel was already accepted.');
  const owner = (await signer.getRecommendedAddressObj()).script;
  const named = bytesToHex(duel.opponent);
  if (named !== bytesToHex(ZERO_32) && named.toLowerCase() !== owner.hash().toLowerCase()) {
    throw new Error('This challenge was sent to someone else.');
  }
  const next = encodeDuel({ ...duel, status: STATUS_LIVE, opponent: hexToBytes(owner.hash()), key1: hexToBytes(session.lock.hash()) });
  const racer = racerScript(duelId, 1);
  const keyOutput =
    duel.kind === KIND_RACE
      ? ccc.CellOutput.from({ capacity: racerCapacity(session.lock, owner, racer), lock: session.lock, type: racer })
      : ccc.CellOutput.from({ capacity: keyCellCapacity(session.lock, owner), lock: session.lock });
  const tx = ccc.Transaction.from({
    inputs: [ccc.CellInput.from({ previousOutput: cell.outPoint, since: 0 })],
    outputs: [
      ccc.CellOutput.from({
        capacity: BigInt(cell.cellOutput.capacity) + duel.stake,
        lock: cell.cellOutput.lock,
        type: cell.cellOutput.type,
      }),
      keyOutput,
    ],
    outputsData: [ccc.hexFrom(next), duel.kind === KIND_RACE ? ccc.hexFrom(encodeRacer({ laps: 0, lapStartMs: 0n, chain: ZERO_32 })) : '0x'],
    cellDeps: duelCellDeps(),
  });
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  const txHash = await signer.sendTransaction(tx);
  requestWalletRefresh();
  return { txHash, index: '0x0' };
}

/** Where an artillery duel stands: the board as the chain would replay it, and the wind the next shot will fire in (from the block the duel last landed in). */
export async function artilleryBoard(
  client: ccc.Client,
  point: OutPointRef,
): Promise<{ duel: DuelCell; duelId: ccc.Hex; board: ArtilleryState; wind: number; landedMs: bigint } | null> {
  const { duel, duelId } = await liveDuel(client, point);
  const landed = await landedBlock(client, point.txHash);
  if (!landed || duel.status !== STATUS_LIVE || duel.kind !== KIND_ARTILLERY) return null;
  const seedBlock = duel.shots.length === 0 ? hexToBytes(landed.blockHash) : duel.seedBlock;
  const id = hexToBytes(duelId);
  return {
    duel,
    duelId,
    board: replay(duelSeed(id, seedBlock), duel.shots),
    wind: duelWind(id, hexToBytes(landed.blockHash)),
    landedMs: landed.landedMs,
  };
}

/** Fires one artillery shot, signed by the player's session key: no wallet popup. */
export async function fireShot(client: ccc.Client, point: OutPointRef, session: ccc.Hex, aim: Shot): Promise<OutPointRef> {
  return addMoves(client, point, session, (duelId, block) => ({
    moves: [{ angle: aim.angle, power: aim.power, wind: duelWind(hexToBytes(duelId), hexToBytes(block)) }],
    clock: false,
  }));
}

/** Passes turns the player to move let run out, so the duel goes on without them. */
export async function skipTurns(client: ccc.Client, point: OutPointRef, session: ccc.Hex, turns = 1): Promise<OutPointRef> {
  return addMoves(client, point, session, (_duelId, _block, duel) => {
    const passes = Math.max(1, Math.min(turns, MAX_SHOTS - duel.shots.length));
    return { moves: Array.from({ length: passes }, () => PASS_SHOT), clock: true };
  });
}

/** Adds shots or skips to a live artillery duel, signed by this browser's key cell, which also pays the fee. */
async function addMoves(
  client: ccc.Client,
  point: OutPointRef,
  session: ccc.Hex,
  plan: (duelId: ccc.Hex, block: ccc.Hex, duel: DuelCell) => { moves: ShotRecord[]; clock: boolean },
): Promise<OutPointRef> {
  const { cell, duel, duelId } = await liveDuel(client, point);
  if (duel.status !== STATUS_LIVE || duel.kind !== KIND_ARTILLERY) throw new Error('This duel is not on.');
  if (duel.shots.length >= MAX_SHOTS) throw new Error('Every turn of this duel has been played.');
  const landed = await landedBlock(client, point.txHash);
  if (!landed) throw new Error('The last move is still confirming. Give it a few seconds.');
  const { moves, clock } = plan(duelId, landed.blockHash, duel);
  // A skip shows the time is up by naming the newest block too (see `waited_since_landing`).
  const tip = clock ? await client.getTipHeader() : null;
  // The accept's block seeds the hills; the first move records it.
  const seedBlock = duel.shots.length === 0 ? hexToBytes(landed.blockHash) : duel.seedBlock;
  const next = encodeDuel({ ...duel, seedBlock, shots: [...duel.shots, ...moves] });
  const signer = new ccc.SignerCkbPrivateKey(client, session);
  const key = await sessionCell(signer);
  if (!key) throw new Error('This duel’s key cell is missing, so the shot can’t be signed.');
  const tx = ccc.Transaction.from({
    inputs: [
      ccc.CellInput.from({ previousOutput: cell.outPoint, since: 0 }),
      ccc.CellInput.from({ previousOutput: key.outPoint, since: 0 }),
    ],
    outputs: [
      ccc.CellOutput.from({ capacity: cell.cellOutput.capacity, lock: cell.cellOutput.lock, type: cell.cellOutput.type }),
      ccc.CellOutput.from({ capacity: key.cellOutput.capacity, lock: key.cellOutput.lock }),
    ],
    outputsData: [ccc.hexFrom(next), '0x'],
    cellDeps: duelCellDeps(),
    headerDeps: tip && tip.hash !== landed.blockHash ? [landed.blockHash, tip.hash] : [landed.blockHash],
  });
  await tx.completeFeeChangeToOutput(signer, 1, REGISTRY_FEE_RATE);
  const txHash = await signer.sendTransaction(tx);
  return { txHash, index: '0x0' };
}

/** A race lap's road: where the racer stands and the seed of the lap they play next. */
export type RaceLap = {
  sealed: number;
  block: ccc.Hex;
  seed: bigint;
  /** The next seal must land by then. */
  windowEndsMs: number;
  late: boolean;
};

/** The next lap of a player's race. */
export async function raceLap(client: ccc.Client, duelPoint: OutPointRef, session: ccc.Hex, ownerLockHash: string): Promise<RaceLap | null> {
  const { duelId } = await liveDuel(client, duelPoint);
  const signer = new ccc.SignerCkbPrivateKey(client, session);
  const racer = await sessionCell(signer);
  if (!racer) return null;
  const run = decodeRacer(hexToBytes(racer.outputData));
  const landed = await landedBlock(client, run.laps === 0 ? duelPoint.txHash : racer.outPoint.txHash);
  if (!landed) return null;
  return {
    sealed: run.laps,
    block: landed.blockHash,
    seed: runSeed(duelId, ownerLockHash, landed.blockHash),
    windowEndsMs: Number(landed.landedMs) + LAP_WINDOW_MS,
    late: run.laps > 0 && !lapOnTime(run.lapStartMs, landed.landedMs),
  };
}

/** Seals one race lap into the player's racer cell, signed by their session key. Returns where it is. */
export async function sealRaceLap(client: ccc.Client, duelPoint: OutPointRef, session: ccc.Hex, tape: Uint8Array): Promise<OutPointRef> {
  const { cell: duelCell, duel } = await liveDuel(client, duelPoint);
  if (duel.status !== STATUS_LIVE || duel.kind !== KIND_RACE) throw new Error('This race is not on.');
  const signer = new ccc.SignerCkbPrivateKey(client, session);
  const racer = await sessionCell(signer);
  if (!racer?.cellOutput.type) throw new Error('This race’s racer cell is missing.');
  const run = decodeRacer(hexToBytes(racer.outputData));
  const source = await landedBlock(client, run.laps === 0 ? duelPoint.txHash : racer.outPoint.txHash);
  if (!source) throw new Error('Still confirming. Give it a few seconds.');
  if (run.laps > 0 && !lapOnTime(run.lapStartMs, source.landedMs)) {
    throw new Error('Your last lap was sealed after its window closed, so this race can’t go on.');
  }
  const moves = ckbHash([tape]);
  const next = encodeRacer({ laps: run.laps + 1, lapStartMs: source.landedMs, chain: foldLap(run.chain, hexToBytes(source.blockHash), moves) });
  const witness = new Uint8Array(33);
  witness[0] = SEAL_VERSION;
  witness.set(moves, 1);
  const tx = ccc.Transaction.from({
    inputs: [ccc.CellInput.from({ previousOutput: racer.outPoint, since: 0 })],
    outputs: [ccc.CellOutput.from({ capacity: racer.cellOutput.capacity, lock: racer.cellOutput.lock, type: racer.cellOutput.type })],
    outputsData: [ccc.hexFrom(next)],
    cellDeps: [...duelCellDeps(), ccc.CellDep.from({ outPoint: duelCell.outPoint, depType: 'code' })],
    headerDeps: [source.blockHash],
  });
  tx.setWitnessArgsAt(0, { inputType: ccc.hexFrom(witness) });
  await tx.completeFeeChangeToOutput(signer, 0, REGISTRY_FEE_RATE);
  const txHash = await signer.sendTransaction(tx);
  return { txHash, index: '0x0' };
}

/** Hands in a player's race: their racer cell is spent (only their session key can), the chain replays the laps, and the score is recorded in the duel. */
export async function submitRace(
  client: ccc.Client,
  duelPoint: OutPointRef,
  session: ccc.Hex,
  owner: ccc.Script,
  laps: SealedLap[],
  score: number,
): Promise<OutPointRef> {
  const { cell, duel } = await liveDuel(client, duelPoint);
  if (duel.status !== STATUS_LIVE || duel.kind !== KIND_RACE) throw new Error('This race is not on.');
  const signer = new ccc.SignerCkbPrivateKey(client, session);
  const sessionHash = (await signer.getRecommendedAddressObj()).script.hash().toLowerCase();
  const side: 0 | 1 | null =
    bytesToHex(duel.key0).toLowerCase() === sessionHash ? 0 : bytesToHex(duel.key1).toLowerCase() === sessionHash ? 1 : null;
  if (side === null) throw new Error('This browser is not racing in that duel.');
  const racer = await sessionCell(signer);
  if (!racer?.cellOutput.type) throw new Error('This race’s racer cell is missing.');
  const racerLanded = await landedBlock(client, racer.outPoint.txHash);
  if (!racerLanded) throw new Error('Your last lap is still confirming. Give it a few seconds.');
  // A last lap sealed outside its window scores 0, and the script then expects no run at all: the witness is just version and zero laps.
  const sealed = decodeRacer(hexToBytes(racer.outputData));
  const late = sealed.laps === 0 || !lapOnTime(sealed.lapStartMs, racerLanded.landedMs);
  const scores: [bigint, bigint] = [...duel.scores];
  scores[side] = late ? 0n : BigInt(score);
  const next = encodeDuel({ ...duel, scores, submitted: duel.submitted | (1 << side) });
  // The submit witness: version 1, then the run as a steal carries it.
  const run = late ? new Uint8Array([1, 0]) : runWitness(laps);
  run[0] = 1;
  const tx = ccc.Transaction.from({
    inputs: [
      ccc.CellInput.from({ previousOutput: cell.outPoint, since: 0 }),
      ccc.CellInput.from({ previousOutput: racer.outPoint, since: 0 }),
    ],
    outputs: [
      ccc.CellOutput.from({ capacity: cell.cellOutput.capacity, lock: cell.cellOutput.lock, type: cell.cellOutput.type }),
      ccc.CellOutput.from({ capacity: racer.cellOutput.capacity, lock: owner }),
    ],
    outputsData: [ccc.hexFrom(next), '0x'],
    cellDeps: duelCellDeps(),
    headerDeps: [racerLanded.blockHash],
  });
  tx.setWitnessArgsAt(0, { inputType: ccc.hexFrom(run) });
  await tx.completeFeeChangeToOutput(signer, 1, REGISTRY_FEE_RATE);
  const txHash = await signer.sendTransaction(tx);
  return { txHash, index: '0x0' };
}

/** Who a duel pays, as the chain will judge it: a side, a draw, or nobody yet. */
export type DuelResult = { kind: 'side'; side: 0 | 1; byTimeout: boolean } | { kind: 'draw' } | { kind: 'pending' };

/** The result a finish sent now would get. */
export async function duelResult(client: ccc.Client, point: OutPointRef, waited: boolean): Promise<DuelResult> {
  const { duel, duelId } = await liveDuel(client, point);
  if (duel.status !== STATUS_LIVE) return { kind: 'pending' };
  if (duel.kind === KIND_ARTILLERY) {
    const count = duel.shots.length;
    if (count > 0) {
      const board = replay(duelSeed(hexToBytes(duelId), duel.seedBlock), duel.shots);
      if (board.winner === 'draw') return { kind: 'draw' };
      if (board.winner !== null) return { kind: 'side', side: board.winner, byTimeout: false };
    }
    return { kind: 'pending' };
  }
  if (duel.submitted !== 0b11 && !waited) return { kind: 'pending' };
  const score = (side: 0 | 1) => (duel.submitted & (1 << side) ? duel.scores[side] : 0n);
  const [a, b] = [score(0), score(1)];
  if (a === b) return { kind: 'draw' };
  return { kind: 'side', side: a > b ? 0 : 1, byTimeout: duel.submitted !== 0b11 };
}

/** Ends a duel and pays it out. */
export async function finishDuel(client: ccc.Client, point: OutPointRef, waited = false): Promise<string> {
  const { cell, duel } = await liveDuel(client, point);
  const result = await duelResult(client, point, waited);
  if (result.kind === 'pending') throw new Error('This duel is not over yet.');
  const total = BigInt(cell.cellOutput.capacity);
  const challenger = await lockFromHistory(client, cell, bytesToHex(duel.challenger));
  const opponent = await lockFromHistory(client, cell, bytesToHex(duel.opponent));
  // The cell holds both stakes and the challenger's storage deposit.
  const outputs =
    result.kind === 'draw'
      ? [
          ccc.CellOutput.from({ capacity: total - duel.stake, lock: challenger }),
          ccc.CellOutput.from({ capacity: duel.stake, lock: opponent }),
        ]
      : result.side === 0
        ? [ccc.CellOutput.from({ capacity: total, lock: challenger })]
        : [
            ccc.CellOutput.from({ capacity: total - 2n * duel.stake, lock: challenger }),
            ccc.CellOutput.from({ capacity: 2n * duel.stake, lock: opponent }),
          ];
  // A race whose time ran out shows it by naming the duel's own block and the newest one.
  const clock = waited && duel.kind === KIND_RACE && duel.submitted !== 0b11;
  const landed = clock ? await landedBlock(client, point.txHash) : null;
  const tip = clock ? await client.getTipHeader() : null;
  const tx = ccc.Transaction.from({
    inputs: [ccc.CellInput.from({ previousOutput: cell.outPoint, since: 0 })],
    outputs,
    outputsData: outputs.map(() => '0x'),
    cellDeps: duelCellDeps(),
    headerDeps: landed && tip ? [landed.blockHash, tip.hash] : [],
  });
  tx.outputs[0]!.capacity -= sizedFee(tx);
  const txHash = await client.sendTransaction(tx);
  requestWalletRefresh();
  return txHash;
}

/** A player's full lock from its hash. */
async function lockFromHistory(client: ccc.Client, duel: ccc.Cell, hash: string): Promise<ccc.Script> {
  let txHash: string | undefined = duel.outPoint.txHash;
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
  throw new Error('A player’s lock could not be read from this duel’s history.');
}

/** A duel as the screens see it: where its cell is, what it holds, and when it last landed. */
export type DuelSnapshot = {
  duelId: ccc.Hex;
  point: OutPointRef;
  duel: DuelCell;
  capacity: bigint;
  /** The block the duel cell landed in, once confirmed. */
  landed: { blockHash: ccc.Hex; landedMs: bigint } | null;
};

async function viewOf(client: ccc.Client, cell: ccc.Cell): Promise<DuelSnapshot> {
  return {
    duelId: cell.cellOutput.type!.args,
    point: { txHash: cell.outPoint.txHash, index: ccc.numToHex(cell.outPoint.index) },
    duel: decodeDuel(hexToBytes(cell.outputData)),
    capacity: BigInt(cell.cellOutput.capacity),
    landed: await landedBlock(client, cell.outPoint.txHash),
  };
}

/** The live cell of a duel, found by its id. Null once the duel is finished or cancelled. */
export async function findDuel(client: ccc.Client, duelId: string): Promise<DuelSnapshot | null> {
  for await (const cell of client.findCells({ script: duelScript(duelId), scriptType: 'type', scriptSearchMode: 'exact', withData: true }, 'desc', 1)) {
    return viewOf(client, cell);
  }
  return null;
}

/** A duel that is no longer live (finished or cancelled): its last state, read back from the transaction that wrote it, so a finished duel can still be shown and replayed. */
export async function findPastDuel(client: ccc.Client, duelId: string): Promise<DuelSnapshot | null> {
  for await (const item of client.findTransactionsByType(duelScript(duelId), false, 'desc', 20)) {
    if (item.isInput) continue;
    const found = await client.getTransaction(item.txHash);
    const index = Number(item.cellIndex);
    const output = found?.transaction.outputs[index];
    const data = found?.transaction.outputsData[index];
    if (!found || !output || data === undefined) continue;
    return viewOf(client, ccc.Cell.from({ outPoint: { txHash: item.txHash, index }, cellOutput: output, outputData: data }));
  }
  return null;
}

/** Every live duel on this network (racer cells left out), newest first. */
export async function listDuels(client: ccc.Client, limit = 60): Promise<DuelSnapshot[]> {
  const prefix = ccc.Script.from({ codeHash: duelType.codeHash, hashType: duelType.hashType, args: '0x' });
  const found: DuelSnapshot[] = [];
  for await (const cell of client.findCells({ script: prefix, scriptType: 'type', scriptSearchMode: 'prefix', withData: true }, 'desc', limit)) {
    if (ccc.bytesFrom(cell.cellOutput.type!.args).length !== 32) continue;
    try {
      found.push(await viewOf(client, cell));
    } catch {
      // Not a duel this app can read.
    }
  }
  return found;
}

/** A duel that has ended: paid out, or cancelled before anyone accepted. */
export type FinishedDuel = {
  duelId: ccc.Hex;
  /** The transaction that ended it: the payout (or the cancel). Check it on `/verify`. */
  txHash: ccc.Hex;
  /** When that transaction landed, in ms. */
  endedMs: number | null;
  /** The duel as it stood just before it ended. */
  duel: DuelCell;
  /** Who it paid: a side, both (a draw), or nobody (cancelled). */
  outcome: 0 | 1 | 'draw' | 'cancelled';
};

/** Duels that have ended, newest first, read from the chain's history: every transaction that spent a duel cell without making a new one is a payout or a cancel. */
export async function listFinishedDuels(client: ccc.Client, limit = 40): Promise<FinishedDuel[]> {
  const prefix = ccc.Script.from({ codeHash: duelType.codeHash, hashType: duelType.hashType, args: '0x' });
  const isDuelCell = (type: ccc.Script | undefined) =>
    Boolean(type && type.codeHash === prefix.codeHash && type.hashType === prefix.hashType && ccc.bytesFrom(type.args).length === 32);

  // Shots, laps and accepts all spend a duel-script cell and make a new one.
  const spent = new Map<string, number>();
  const made = new Set<string>();
  for await (const item of client.findTransactions(
    { script: prefix, scriptType: 'type', scriptSearchMode: 'prefix', groupByTransaction: false },
    'desc',
    400,
  )) {
    if (item.isInput) {
      if (!spent.has(item.txHash)) spent.set(item.txHash, Number(item.cellIndex));
    } else made.add(item.txHash);
  }
  const candidates = [...spent].filter(([hash]) => !made.has(hash)).slice(0, limit * 2);

  const read = async ([txHash, inputIndex]: [string, number]): Promise<FinishedDuel | null> => {
    try {
      const response = await client.getTransaction(txHash);
      const tx = response?.transaction;
      if (!tx || tx.outputs.some((output) => isDuelCell(output.type))) return null;
      // The duel cell is whichever duel-script input has 32-byte args (a race's racer cells have 33).
      for (const input of [tx.inputs[inputIndex], ...tx.inputs]) {
        const cell = input ? await client.getCell(input.previousOutput) : undefined;
        if (!cell || !isDuelCell(cell.cellOutput.type)) continue;
        const duelId = cell.cellOutput.type!.args;
        const duel = decodeDuel(hexToBytes(cell.outputData));
        let outcome: FinishedDuel['outcome'] = 'cancelled';
        if (duel.status === STATUS_LIVE) {
          if (duel.kind === KIND_ARTILLERY) {
            const winner = replay(duelSeed(hexToBytes(duelId), duel.seedBlock), duel.shots).winner;
            outcome = winner === null ? 'draw' : winner;
          } else {
            // A racer who never handed in scores 0.
            const score = (side: 0 | 1) => ((duel.submitted >> side) & 1 ? duel.scores[side] : 0n);
            outcome = score(0) === score(1) ? 'draw' : score(0) > score(1) ? 0 : 1;
          }
        }
        const header = response.blockHash ? await client.getHeaderByHash(response.blockHash) : undefined;
        return { duelId, txHash: txHash as ccc.Hex, endedMs: header ? Number(header.timestamp) : null, duel, outcome };
      }
    } catch {
      // A duel this app cannot read (an older layout): leave it out.
    }
    return null;
  };
  const found = (await Promise.all(candidates.map(read))).filter((item): item is FinishedDuel => item !== null);
  return found.sort((a, b) => (b.endedMs ?? 0) - (a.endedMs ?? 0)).slice(0, limit);
}
