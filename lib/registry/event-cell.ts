/**
 * Event Cell client — v3 codecs + mint helpers.
 * Create mints Event Cell + empty treasury (spendable pot = 0).
 */

import { ccc } from '@ckb-ccc/connector-react';
import {
  REGISTRY_FEE_RATE,
  assertEventEngineConfigured,
  eventEngineConfigured,
  eventRewardClaimType,
  participantType,
} from './config';
import { computeMinCapacityNoType, computeMinCellCapacity } from './capacity';
import {
  getEventEngineCellDeps,
  getEventCellTypeScriptFor,
  getEventTreasuryLockScript,
  getParticipantTypeScriptFor,
} from './scripts';
import type { Signer } from './username';
import {
  EventModeCode,
  EventStatusCode,
  ckbToShannons,
  decodeEventCellData,
  encodeEventCellData,
  encodeEventTreasuryArgs,
  encodeParticipantArgs,
  encodeParticipantData,
  type EventCellData,
} from './event-cell-layout';
import { hashRules, hashTopics } from './event-commits';
import { computeTypeId, bytesToHex, hexToBytes } from './ckb-bytes';

export {
  EVENT_CELL_DATA_LEN,
  EVENT_CELL_VERSION,
  EVENT_FLAG_INLINE_POT,
  PARTICIPANT_DATA_LEN,
  CLAIM_DATA_LEN,
  MAX_PARTICIPANT_SLOTS,
  EventModeCode,
  EventStatusCode,
  EventTurnStateCode,
  SHANNONS_PER_CKB,
  ckbToShannons,
  shannonsToCkb,
  encodeEventCellData,
  decodeEventCellData,
  encodeEventTreasuryArgs,
  encodeParticipantArgs,
  encodeParticipantData,
  decodeParticipantData,
  encodeClaimData,
  decodeClaimData,
  encodeClaimArgs,
  absoluteTimestampSince,
  type EventCellData,
} from './event-cell-layout';

export function eventCellsLive(): boolean {
  return eventEngineConfigured();
}

function cellDataFromHex(hex: string): Uint8Array {
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (raw.length % 2 !== 0) throw new Error('Odd-length hex cell data.');
  const out = new Uint8Array(raw.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function randomNonce32(): Uint8Array {
  const out = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(out);
  } else {
    for (let i = 0; i < 32; i += 1) out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

function isZero32(bytes: Uint8Array): boolean {
  return bytes.every((b) => b === 0);
}

function same32(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== 32 || b.length !== 32) return false;
  return a.every((v, i) => v === b[i]);
}

export type CreateEventCellInput = {
  mode: number;
  minPlayers: number;
  maxPlayers: number;
  /** Base turn duration in seconds (shrinking clock). */
  turnSecs: number;
  /** Seconds removed each turn; default 0. */
  shrinkStepSecs?: number;
  /** Floor turn duration in seconds; default = turnSecs. */
  minTurnSecs?: number;
  winnersN: number;
  /** Entry stake in whole CKB (converted to shannons). */
  entryFeeCkb: number;
  startTimeMs?: number;
  communityId?: Uint8Array;
  topics: string[];
  difficulty: string;
  rulesJson?: string;
};

/**
 * Build unsigned Event create: Event Cell (REGISTRATION) + empty treasury.
 * Event lock = controller = creator. Pot starts at 0.
 */
export async function buildCreateEventTx(
  signer: NonNullable<Signer>,
  input: CreateEventCellInput,
): Promise<{ tx: ccc.Transaction; eventId: string }> {
  assertEventEngineConfigured();
  const owner = (await signer.getRecommendedAddressObj()).script;
  const ownerHash = hexToBytes(owner.hash());

  const draft = ccc.Transaction.from({
    outputs: [{ lock: owner }],
  });
  await draft.completeInputsByCapacity(signer);
  const firstInput = draft.inputs[0];
  if (!firstInput) throw new Error('No inputs to derive event type-id.');

  const eventIdBytes = computeTypeId(firstInput, 0);
  const eventId = bytesToHex(eventIdBytes);
  const eventType = getEventCellTypeScriptFor(eventId);
  const eventTypeHash = hexToBytes(eventType.hash());

  const treasuryArgs = encodeEventTreasuryArgs(eventTypeHash, eventIdBytes);
  const treasuryLock = getEventTreasuryLockScript(bytesToHex(treasuryArgs));
  const treasuryLockHash = hexToBytes(treasuryLock.hash());

  const data = encodeEventCellData({
    status: EventStatusCode.Registration,
    mode: input.mode,
    playerCount: 0,
    maxPlayers: input.maxPlayers,
    minPlayers: input.minPlayers,
    baseTurnSecs: BigInt(input.turnSecs),
    shrinkStepSecs: BigInt(input.shrinkStepSecs ?? 0),
    minTurnSecs: BigInt(input.minTurnSecs ?? input.turnSecs),
    winnersN: input.winnersN,
    entryFeeShannons: ckbToShannons(input.entryFeeCkb),
    potAmountShannons: 0n,
    finalPotShannons: 0n,
    startTimeMs: BigInt(input.startTimeMs ?? 0),
    eventId: eventIdBytes,
    communityId: input.communityId,
    creatorLockHash: ownerHash,
    controllerLockHash: ownerHash,
    treasuryLockHash,
    participantCodeHash: hexToBytes(participantType.codeHash),
    rewardClaimCodeHash: hexToBytes(eventRewardClaimType.codeHash),
    rulesHash: hashRules(input.rulesJson ?? '{}'),
    questionSetHash: hashTopics(input.topics, input.difficulty),
  });

  const eventCapacity = computeMinCellCapacity(owner, eventType, data);
  const treasuryData = new Uint8Array(0);
  const treasuryCapacity = computeMinCapacityNoType(treasuryLock, treasuryData);

  const tx = ccc.Transaction.from({
    inputs: draft.inputs,
    outputs: [
      { lock: owner, type: eventType, capacity: eventCapacity },
      { lock: treasuryLock, capacity: treasuryCapacity },
    ],
    outputsData: [ccc.hexFrom(data), ccc.hexFrom(treasuryData)],
    cellDeps: getEventEngineCellDeps(),
  });
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  return { tx, eventId };
}

export type JoinEventCellInput = {
  eventId: string;
  eventOutPoint: { txHash: string; index: ccc.NumLike };
  treasuryOutPoint: { txHash: string; index: ccc.NumLike };
  eventData: string | Uint8Array;
  treasuryCapacity: bigint;
  slot: number;
  /**
   * Joining player lock. Defaults to signer's address.
   * Note: Event Cell lock is the controller — signer must unlock it (relayer MVP).
   */
  playerLock?: ccc.Script;
};

/**
 * Join during REGISTRATION: roster slot + treasury += entry fee + Participant cell.
 * Signer must be able to unlock the Event Cell (controller/relayer).
 */
export async function buildJoinEventTx(
  signer: NonNullable<Signer>,
  input: JoinEventCellInput,
): Promise<ccc.Transaction> {
  assertEventEngineConfigured();
  const client = signer.client;
  const player =
    input.playerLock ?? (await signer.getRecommendedAddressObj()).script;
  const playerHash = hexToBytes(player.hash());

  const eventBytes =
    typeof input.eventData === 'string'
      ? cellDataFromHex(input.eventData)
      : input.eventData;
  const event = decodeEventCellData(eventBytes);
  if (event.status !== EventStatusCode.Registration) {
    throw new Error('Event is not open for registration.');
  }
  if (input.slot < 0 || input.slot >= event.maxPlayers) {
    throw new Error('Slot out of range.');
  }
  if (!isZero32(event.participants[input.slot] ?? zeros())) {
    throw new Error('Slot already taken.');
  }
  if (event.participants.some((p) => same32(p, playerHash))) {
    throw new Error('Already joined.');
  }

  const liveEvent = await client.getCellLive(
    {
      txHash: input.eventOutPoint.txHash,
      index: input.eventOutPoint.index,
    },
    true,
  );
  if (!liveEvent) throw new Error('Event cell not found.');

  const eventIdBytes = hexToBytes(input.eventId);
  const eventType = getEventCellTypeScriptFor(input.eventId);
  const eventTypeHash = hexToBytes(eventType.hash());

  const nextParticipants = Array.from({ length: event.maxPlayers }, (_, i) => {
    if (i === input.slot) return playerHash;
    return new Uint8Array(event.participants[i] ?? zeros());
  });

  const nextData = encodeEventCellData({
    status: event.status,
    flags: event.flags,
    mode: event.mode,
    minPlayers: event.minPlayers,
    maxPlayers: event.maxPlayers,
    playerCount: event.playerCount + 1,
    winnersN: event.winnersN,
    winnerCount: event.winnerCount,
    baseTurnSecs: event.baseTurnSecs,
    shrinkStepSecs: event.shrinkStepSecs,
    minTurnSecs: event.minTurnSecs,
    entryFeeShannons: event.entryFeeShannons,
    potAmountShannons: event.potAmountShannons + event.entryFeeShannons,
    finalPotShannons: event.finalPotShannons,
    startTimeMs: event.startTimeMs,
    endTimeMs: event.endTimeMs,
    eventId: eventIdBytes,
    communityId: event.communityId,
    creatorLockHash: event.creatorLockHash,
    controllerLockHash: event.controllerLockHash,
    treasuryLockHash: event.treasuryLockHash,
    participantCodeHash: event.participantCodeHash,
    rulesHash: event.rulesHash,
    questionSetHash: event.questionSetHash,
    resultHash: event.resultHash,
    turnNumber: event.turnNumber,
    turnState: event.turnState,
    selectedIndex: event.selectedIndex,
    turnStartedMs: event.turnStartedMs,
    turnDeadlineMs: event.turnDeadlineMs,
    currentHolderLockHash: event.currentHolderLockHash,
    previousHolderLockHash: event.previousHolderLockHash,
    actionCommit: event.actionCommit,
    rewardClaimCodeHash: event.rewardClaimCodeHash,
    participants: nextParticipants,
  });

  const treasuryArgs = encodeEventTreasuryArgs(eventTypeHash, eventIdBytes);
  const treasuryLock = getEventTreasuryLockScript(bytesToHex(treasuryArgs));
  const nextTreasuryCapacity = input.treasuryCapacity + event.entryFeeShannons;

  const participantArgs = encodeParticipantArgs(
    eventTypeHash,
    eventIdBytes,
    playerHash,
  );
  const participantTypeScript = getParticipantTypeScriptFor(
    bytesToHex(participantArgs),
  );
  const participantData = encodeParticipantData({
    entryFeeShannons: event.entryFeeShannons,
    joinedAtMs: BigInt(Date.now()),
    nonce: randomNonce32(),
    slot: input.slot,
  });
  const participantCapacity = computeMinCellCapacity(
    player,
    participantTypeScript,
    participantData,
  );

  const tx = ccc.Transaction.from({
    inputs: [
      {
        previousOutput: {
          txHash: input.eventOutPoint.txHash,
          index: input.eventOutPoint.index,
        },
      },
      {
        previousOutput: {
          txHash: input.treasuryOutPoint.txHash,
          index: input.treasuryOutPoint.index,
        },
      },
    ],
    outputs: [
      {
        lock: liveEvent.cellOutput.lock,
        type: eventType,
        capacity: liveEvent.cellOutput.capacity,
      },
      { lock: treasuryLock, capacity: nextTreasuryCapacity },
      {
        lock: player,
        type: participantTypeScript,
        capacity: participantCapacity,
      },
    ],
    outputsData: [
      ccc.hexFrom(nextData),
      ccc.hexFrom(new Uint8Array(0)),
      ccc.hexFrom(participantData),
    ],
    cellDeps: getEventEngineCellDeps(),
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  return tx;
}

export type MintedEventCell = {
  eventId: string;
  txHash: string;
  eventOutPoint: { txHash: string; index: string };
  treasuryOutPoint: { txHash: string; index: string };
};

/** Build + sign + wait Event create (outputs 0=event, 1=treasury). */
export async function mintCreateEvent(
  signer: NonNullable<Signer>,
  input: CreateEventCellInput,
): Promise<MintedEventCell> {
  const { tx, eventId } = await buildCreateEventTx(signer, input);
  const txHash = await signer.sendTransaction(tx);
  await signer.client.waitTransaction(txHash);
  return {
    eventId,
    txHash,
    eventOutPoint: { txHash, index: '0x0' },
    treasuryOutPoint: { txHash, index: '0x1' },
  };
}

export type JoinedEventCell = {
  txHash: string;
  eventOutPoint: { txHash: string; index: string };
  treasuryOutPoint: { txHash: string; index: string };
  participantOutPoint: { txHash: string; index: string };
  slot: number;
};

/**
 * Build + sign + wait join. Signer must unlock the Event Cell (controller/host MVP).
 * Outputs: 0=event, 1=treasury, 2=participant (+ change).
 */
export async function joinEventOnChain(
  signer: NonNullable<Signer>,
  input: JoinEventCellInput,
): Promise<JoinedEventCell> {
  const tx = await buildJoinEventTx(signer, input);
  const txHash = await signer.sendTransaction(tx);
  await signer.client.waitTransaction(txHash);
  return {
    txHash,
    eventOutPoint: { txHash, index: '0x0' },
    treasuryOutPoint: { txHash, index: '0x1' },
    participantOutPoint: { txHash, index: '0x2' },
    slot: input.slot,
  };
}

/** Map app EventMode → on-chain EventModeCode. */
export function eventModeToCode(mode: string): number {
  switch (mode) {
    case 'rapid_qa':
      return EventModeCode.RapidQa;
    case 'survival':
      return EventModeCode.Survival;
    case 'shrinking_clock':
      return EventModeCode.ShrinkingClock;
    case 'pot_rush':
      return EventModeCode.PotRush;
    case 'knowledge_battle':
      return EventModeCode.KnowledgeBattle;
    case 'creative_challenge':
      return EventModeCode.CreativeChallenge;
    case 'rescue':
      return EventModeCode.Rescue;
    case 'chain':
      return EventModeCode.Chain;
    default:
      return EventModeCode.PotRush;
  }
}

function zeros() {
  return new Uint8Array(32);
}

export function parseEventCellData(raw: string | Uint8Array): EventCellData {
  const bytes = typeof raw === 'string' ? cellDataFromHex(raw) : raw;
  return decodeEventCellData(bytes);
}
