/**
 * Event Engine v3 layouts — byte-identical to protocol-common.
 * Event Cell: 2576 bytes (528 base + 64×32 roster).
 */

export const EVENT_CELL_DATA_LEN = 2576;
export const EVENT_BASE_LEN = 528;
export const EVENT_CELL_VERSION = 3;
export const MAX_PARTICIPANT_SLOTS = 64;
export const PARTICIPANT_SLOT_SIZE = 32;

export const PARTICIPANT_DATA_LEN = 56;
export const PARTICIPANT_VERSION = 1;

export const CLAIM_DATA_LEN = 96;
export const CLAIM_VERSION = 1;

export const TREASURY_ARGS_LEN = 64;

/** @deprecated v2 flag — not used in v3 (pot always in treasury). */
export const EVENT_FLAG_INLINE_POT = 0x01;

export const EventStatusCode = {
  Registration: 0,
  Ready: 1,
  Live: 2,
  Paused: 3,
  Finished: 4,
  Settled: 5,
} as const;

export const EventModeCode = {
  RapidQa: 0,
  Survival: 1,
  ShrinkingClock: 2,
  PotRush: 3,
  KnowledgeBattle: 4,
  CreativeChallenge: 5,
  Rescue: 6,
  Chain: 7,
} as const;

export const EventTurnStateCode = {
  Idle: 0,
  Pending: 1,
  Answered: 2,
  TimedOut: 3,
} as const;

const O = {
  version: 0,
  status: 1,
  flags: 2,
  mode: 3,
  minPlayers: 4,
  maxPlayers: 6,
  playerCount: 8,
  winnersN: 10,
  winnerCount: 12,
  baseTurnSecs: 14,
  shrinkStepSecs: 22,
  minTurnSecs: 30,
  entryFee: 38,
  pot: 46,
  finalPot: 54,
  startTime: 62,
  endTime: 70,
  eventId: 78,
  communityId: 110,
  creatorLock: 142,
  controllerLock: 174,
  treasuryLock: 206,
  participantCodeHash: 238,
  rulesHash: 270,
  questionSetHash: 302,
  resultHash: 334,
  turnNumber: 366,
  turnState: 374,
  selectedIndex: 375,
  turnStarted: 376,
  turnDeadline: 384,
  currentHolder: 392,
  previousHolder: 424,
  actionCommit: 456,
  rewardClaimCodeHash: 488,
  participants: 528,
} as const;

export type EventCellData = {
  status: number;
  flags: number;
  mode: number;
  minPlayers: number;
  maxPlayers: number;
  playerCount: number;
  winnersN: number;
  winnerCount: number;
  baseTurnSecs: bigint;
  shrinkStepSecs: bigint;
  minTurnSecs: bigint;
  entryFeeShannons: bigint;
  potAmountShannons: bigint;
  finalPotShannons: bigint;
  startTimeMs: bigint;
  endTimeMs: bigint;
  eventId: Uint8Array;
  communityId: Uint8Array;
  creatorLockHash: Uint8Array;
  controllerLockHash: Uint8Array;
  treasuryLockHash: Uint8Array;
  participantCodeHash: Uint8Array;
  rulesHash: Uint8Array;
  questionSetHash: Uint8Array;
  resultHash: Uint8Array;
  turnNumber: bigint;
  turnState: number;
  selectedIndex: number;
  turnStartedMs: bigint;
  turnDeadlineMs: bigint;
  currentHolderLockHash: Uint8Array;
  previousHolderLockHash: Uint8Array;
  actionCommit: Uint8Array;
  rewardClaimCodeHash: Uint8Array;
  /** Roster lock hashes; length = maxPlayers (empty slots are zeros). */
  participants: Uint8Array[];
};

function view(data: Uint8Array) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

function zeros32() {
  return new Uint8Array(32);
}

function require32(bytes: Uint8Array, label: string) {
  if (bytes.length !== 32) throw new Error(`${label} must be 32 bytes`);
}

function writeI8(out: Uint8Array, offset: number, value: number) {
  out[offset] = value < 0 ? (256 + (value | 0)) & 0xff : value & 0xff;
}

function readI8(raw: Uint8Array, offset: number): number {
  const v = raw[offset] ?? 0;
  return v > 127 ? v - 256 : v;
}

/**
 * Encode Event Cell data (v3, 2576 bytes).
 * Create requires: pot=0, finalPot=0, playerCount=0, empty roster, IDLE turn.
 */
export function encodeEventCellData(input: {
  status?: number;
  flags?: number;
  mode: number;
  minPlayers: number;
  maxPlayers: number;
  playerCount?: number;
  winnersN: number;
  winnerCount?: number;
  baseTurnSecs: bigint;
  shrinkStepSecs?: bigint;
  minTurnSecs?: bigint;
  entryFeeShannons: bigint;
  potAmountShannons?: bigint;
  finalPotShannons?: bigint;
  startTimeMs?: bigint;
  endTimeMs?: bigint;
  eventId: Uint8Array;
  communityId?: Uint8Array;
  creatorLockHash: Uint8Array;
  controllerLockHash: Uint8Array;
  treasuryLockHash: Uint8Array;
  participantCodeHash: Uint8Array;
  rulesHash?: Uint8Array;
  questionSetHash?: Uint8Array;
  resultHash?: Uint8Array;
  turnNumber?: bigint;
  turnState?: number;
  selectedIndex?: number;
  turnStartedMs?: bigint;
  turnDeadlineMs?: bigint;
  currentHolderLockHash?: Uint8Array;
  previousHolderLockHash?: Uint8Array;
  actionCommit?: Uint8Array;
  rewardClaimCodeHash: Uint8Array;
  participants?: Uint8Array[];
}): Uint8Array {
  require32(input.eventId, 'eventId');
  require32(input.creatorLockHash, 'creatorLockHash');
  require32(input.controllerLockHash, 'controllerLockHash');
  require32(input.treasuryLockHash, 'treasuryLockHash');
  require32(input.participantCodeHash, 'participantCodeHash');
  require32(input.rewardClaimCodeHash, 'rewardClaimCodeHash');
  if (input.maxPlayers < 1 || input.maxPlayers > MAX_PARTICIPANT_SLOTS) {
    throw new Error(`maxPlayers must be 1–${MAX_PARTICIPANT_SLOTS}`);
  }
  if (input.minPlayers < 1 || input.minPlayers > input.maxPlayers) {
    throw new Error('minPlayers must be 1..maxPlayers');
  }
  if (input.winnersN < 1 || input.winnersN > input.maxPlayers) {
    throw new Error('winnersN must be 1..maxPlayers');
  }
  const base = input.baseTurnSecs;
  const minTurn = input.minTurnSecs ?? base;
  const step = input.shrinkStepSecs ?? 0n;
  if (base === 0n || minTurn === 0n || minTurn > base || step > base) {
    throw new Error('Invalid shrinking-clock turn seconds');
  }

  const out = new Uint8Array(EVENT_CELL_DATA_LEN);
  const dv = view(out);
  out[O.version] = EVENT_CELL_VERSION;
  out[O.status] = input.status ?? EventStatusCode.Registration;
  out[O.flags] = input.flags ?? 0;
  out[O.mode] = input.mode;
  dv.setUint16(O.minPlayers, input.minPlayers & 0xffff, true);
  dv.setUint16(O.maxPlayers, input.maxPlayers & 0xffff, true);
  dv.setUint16(O.playerCount, (input.playerCount ?? 0) & 0xffff, true);
  dv.setUint16(O.winnersN, input.winnersN & 0xffff, true);
  dv.setUint16(O.winnerCount, (input.winnerCount ?? 0) & 0xffff, true);
  dv.setBigUint64(O.baseTurnSecs, base, true);
  dv.setBigUint64(O.shrinkStepSecs, step, true);
  dv.setBigUint64(O.minTurnSecs, minTurn, true);
  dv.setBigUint64(O.entryFee, input.entryFeeShannons, true);
  dv.setBigUint64(O.pot, input.potAmountShannons ?? 0n, true);
  dv.setBigUint64(O.finalPot, input.finalPotShannons ?? 0n, true);
  dv.setBigUint64(O.startTime, input.startTimeMs ?? 0n, true);
  dv.setBigUint64(O.endTime, input.endTimeMs ?? 0n, true);
  out.set(input.eventId, O.eventId);
  out.set(input.communityId ?? zeros32(), O.communityId);
  out.set(input.creatorLockHash, O.creatorLock);
  out.set(input.controllerLockHash, O.controllerLock);
  out.set(input.treasuryLockHash, O.treasuryLock);
  out.set(input.participantCodeHash, O.participantCodeHash);
  out.set(input.rulesHash ?? zeros32(), O.rulesHash);
  out.set(input.questionSetHash ?? zeros32(), O.questionSetHash);
  out.set(input.resultHash ?? zeros32(), O.resultHash);
  dv.setBigUint64(O.turnNumber, input.turnNumber ?? 0n, true);
  out[O.turnState] = input.turnState ?? EventTurnStateCode.Idle;
  writeI8(out, O.selectedIndex, input.selectedIndex ?? -1);
  dv.setBigUint64(O.turnStarted, input.turnStartedMs ?? 0n, true);
  dv.setBigUint64(O.turnDeadline, input.turnDeadlineMs ?? 0n, true);
  out.set(input.currentHolderLockHash ?? zeros32(), O.currentHolder);
  out.set(input.previousHolderLockHash ?? zeros32(), O.previousHolder);
  out.set(input.actionCommit ?? zeros32(), O.actionCommit);
  out.set(input.rewardClaimCodeHash, O.rewardClaimCodeHash);

  const slots = input.participants ?? [];
  for (let i = 0; i < MAX_PARTICIPANT_SLOTS; i += 1) {
    const slot = slots[i];
    if (slot) {
      require32(slot, `participants[${i}]`);
      out.set(slot, O.participants + i * PARTICIPANT_SLOT_SIZE);
    }
  }
  return out;
}

export function decodeEventCellData(raw: Uint8Array): EventCellData {
  if (raw.length !== EVENT_CELL_DATA_LEN || raw[0] !== EVENT_CELL_VERSION) {
    throw new Error('Not a v3 Event Cell.');
  }
  const dv = view(raw);
  const maxPlayers = dv.getUint16(O.maxPlayers, true);
  const participants: Uint8Array[] = [];
  for (let i = 0; i < maxPlayers; i += 1) {
    const off = O.participants + i * PARTICIPANT_SLOT_SIZE;
    participants.push(raw.slice(off, off + 32));
  }
  return {
    status: raw[O.status] ?? 0,
    flags: raw[O.flags] ?? 0,
    mode: raw[O.mode] ?? 0,
    minPlayers: dv.getUint16(O.minPlayers, true),
    maxPlayers,
    playerCount: dv.getUint16(O.playerCount, true),
    winnersN: dv.getUint16(O.winnersN, true),
    winnerCount: dv.getUint16(O.winnerCount, true),
    baseTurnSecs: dv.getBigUint64(O.baseTurnSecs, true),
    shrinkStepSecs: dv.getBigUint64(O.shrinkStepSecs, true),
    minTurnSecs: dv.getBigUint64(O.minTurnSecs, true),
    entryFeeShannons: dv.getBigUint64(O.entryFee, true),
    potAmountShannons: dv.getBigUint64(O.pot, true),
    finalPotShannons: dv.getBigUint64(O.finalPot, true),
    startTimeMs: dv.getBigUint64(O.startTime, true),
    endTimeMs: dv.getBigUint64(O.endTime, true),
    eventId: raw.slice(O.eventId, O.eventId + 32),
    communityId: raw.slice(O.communityId, O.communityId + 32),
    creatorLockHash: raw.slice(O.creatorLock, O.creatorLock + 32),
    controllerLockHash: raw.slice(O.controllerLock, O.controllerLock + 32),
    treasuryLockHash: raw.slice(O.treasuryLock, O.treasuryLock + 32),
    participantCodeHash: raw.slice(O.participantCodeHash, O.participantCodeHash + 32),
    rulesHash: raw.slice(O.rulesHash, O.rulesHash + 32),
    questionSetHash: raw.slice(O.questionSetHash, O.questionSetHash + 32),
    resultHash: raw.slice(O.resultHash, O.resultHash + 32),
    turnNumber: dv.getBigUint64(O.turnNumber, true),
    turnState: raw[O.turnState] ?? 0,
    selectedIndex: readI8(raw, O.selectedIndex),
    turnStartedMs: dv.getBigUint64(O.turnStarted, true),
    turnDeadlineMs: dv.getBigUint64(O.turnDeadline, true),
    currentHolderLockHash: raw.slice(O.currentHolder, O.currentHolder + 32),
    previousHolderLockHash: raw.slice(O.previousHolder, O.previousHolder + 32),
    actionCommit: raw.slice(O.actionCommit, O.actionCommit + 32),
    rewardClaimCodeHash: raw.slice(O.rewardClaimCodeHash, O.rewardClaimCodeHash + 32),
    participants,
  };
}

/** Participant entry cell data (56 bytes). */
export function encodeParticipantData(input: {
  entryFeeShannons: bigint;
  joinedAtMs: bigint;
  nonce: Uint8Array;
  slot: number;
  status?: number;
}): Uint8Array {
  require32(input.nonce, 'nonce');
  if (input.slot < 0 || input.slot >= MAX_PARTICIPANT_SLOTS) {
    throw new Error('slot out of range');
  }
  const out = new Uint8Array(PARTICIPANT_DATA_LEN);
  const dv = view(out);
  out[0] = PARTICIPANT_VERSION;
  out[1] = input.status ?? 0;
  dv.setBigUint64(2, input.entryFeeShannons, true);
  dv.setBigUint64(10, input.joinedAtMs, true);
  out.set(input.nonce, 18);
  dv.setUint16(50, input.slot & 0xffff, true);
  return out;
}

export function decodeParticipantData(raw: Uint8Array) {
  if (raw.length !== PARTICIPANT_DATA_LEN || raw[0] !== PARTICIPANT_VERSION) {
    throw new Error('Not a v1 Participant Cell.');
  }
  const dv = view(raw);
  return {
    status: raw[1] ?? 0,
    entryFeeShannons: dv.getBigUint64(2, true),
    joinedAtMs: dv.getBigUint64(10, true),
    nonce: raw.slice(18, 50),
    slot: dv.getUint16(50, true),
  };
}

/** Claim ticket data (96 bytes). Nonce is 23 bytes (fills to CLAIM_DATA_LEN). */
export function encodeClaimData(input: {
  recipientLockHash: Uint8Array;
  amountShannons: bigint;
  eventId: Uint8Array;
  nonce?: Uint8Array;
}): Uint8Array {
  require32(input.recipientLockHash, 'recipientLockHash');
  require32(input.eventId, 'eventId');
  const out = new Uint8Array(CLAIM_DATA_LEN);
  const dv = view(out);
  out[0] = CLAIM_VERSION;
  out.set(input.recipientLockHash, 1);
  dv.setBigUint64(33, input.amountShannons, true);
  out.set(input.eventId, 41);
  const nonce = input.nonce ?? new Uint8Array(23);
  if (nonce.length > 23) throw new Error('claim nonce must be ≤23 bytes');
  out.set(nonce, 73);
  return out;
}

export function decodeClaimData(raw: Uint8Array) {
  if (raw.length !== CLAIM_DATA_LEN || raw[0] !== CLAIM_VERSION) {
    throw new Error('Not a v1 Claim Cell.');
  }
  const dv = view(raw);
  return {
    recipientLockHash: raw.slice(1, 33),
    amountShannons: dv.getBigUint64(33, true),
    eventId: raw.slice(41, 73),
    nonce: raw.slice(73, 96),
  };
}

/** 1 CKB = 10^8 shannons. */
export const SHANNONS_PER_CKB = 100_000_000n;

export function ckbToShannons(ckb: number | bigint): bigint {
  return BigInt(ckb) * SHANNONS_PER_CKB;
}

export function shannonsToCkb(shannons: bigint): number {
  return Number(shannons / SHANNONS_PER_CKB);
}

/** event-treasury-lock args: event_type_hash || event_id (64 bytes). */
export function encodeEventTreasuryArgs(
  eventTypeHash: Uint8Array,
  eventId: Uint8Array,
): Uint8Array {
  require32(eventTypeHash, 'eventTypeHash');
  require32(eventId, 'eventId');
  const out = new Uint8Array(TREASURY_ARGS_LEN);
  out.set(eventTypeHash, 0);
  out.set(eventId, 32);
  return out;
}

/** participant-type args: event_type_hash || event_id || player_lock_hash (96 bytes). */
export function encodeParticipantArgs(
  eventTypeHash: Uint8Array,
  eventId: Uint8Array,
  playerLockHash: Uint8Array,
): Uint8Array {
  require32(eventTypeHash, 'eventTypeHash');
  require32(eventId, 'eventId');
  require32(playerLockHash, 'playerLockHash');
  const out = new Uint8Array(96);
  out.set(eventTypeHash, 0);
  out.set(eventId, 32);
  out.set(playerLockHash, 64);
  return out;
}

/** reward-claim-type args: event_type_hash || event_id (64 bytes). */
export function encodeClaimArgs(
  eventTypeHash: Uint8Array,
  eventId: Uint8Array,
): Uint8Array {
  return encodeEventTreasuryArgs(eventTypeHash, eventId);
}

/** Absolute timestamp `since` (seconds) for turn timeout vs deadline_ms. */
export function absoluteTimestampSince(deadlineMs: bigint): bigint {
  const secs = deadlineMs / 1000n;
  // metric = timestamp (0b01 << 61), absolute
  return (0x4000_0000_0000_0000n | (secs & 0x00ff_ffff_ffff_ffffn));
}
