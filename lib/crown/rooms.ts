import { DEFAULT_BANK } from '@/lib/sudden-death/bank';
import { shrinkMs, shrunkDeadline, type BankQuestion, type QuestionBank } from '@/lib/sudden-death/codec';

const KEY = 'keepers-crowns';

/** Host-stamped length when a crown does not set one. Two hours. */
export const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

export type CrownStatus = 'lobby' | 'live' | 'settled';

export type CrownFeedItem = {
  id: string;
  text: string;
  good: boolean;
};

export type CrownSeal = {
  id: string;
  label: string;
  detail: string;
  txHash: string | null;
};

export type OutPointRef = { txHash: string; index: string };

export type LockRef = { codeHash: string; hashType: 'type' | 'data' | 'data1' | 'data2'; args: string };

export type CrownRoom = {
  id: string;
  title: string;
  feeShannons: bigint;
  /** Length the host stamps into the match when the clock starts. */
  durationMs: number;
  questions: BankQuestion[];
  status: CrownStatus;
  round: number;
  cursor: number;
  potShannons: bigint;
  king: string | null;
  openedAt: number | null;
  deadlineAt: number | null;
  feed: CrownFeedItem[];
  seals: CrownSeal[];
  matchId: string | null;
  hostLockHash: string | null;
  hostLock: LockRef | null;
  matchOutPoint: OutPointRef | null;
  treasuryOutPoint: OutPointRef | null;
  bidOutPoint: OutPointRef | null;
  kingLock: LockRef | null;
  pendingTx: string | null;
  pendingKind: 'steal' | 'close' | null;
  hostAddress: string | null;
  /** This browser does not have the answer key. Proofs come from the server. */
  answersOnServer?: boolean;
};

type StoredQuestion = Omit<BankQuestion, 'salt'> & { salt: string };
export type StoredRoom = Omit<CrownRoom, 'feeShannons' | 'potShannons' | 'questions'> & {
  feeShannons: string;
  potShannons: string;
  questions: StoredQuestion[];
};

function saltHex(salt: Uint8Array): string {
  return [...salt].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function saltFromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function roomToStored(room: CrownRoom): StoredRoom {
  return toStored(room);
}

export function roomFromStored(room: StoredRoom): CrownRoom {
  return fromStored(room);
}

function toStored(room: CrownRoom): StoredRoom {
  return {
    ...room,
    feeShannons: room.feeShannons.toString(),
    potShannons: room.potShannons.toString(),
    questions: room.questions.map((question) => ({
      ...question,
      salt: saltHex(question.salt),
    })),
  };
}

function fromStored(room: StoredRoom): CrownRoom {
  return {
    ...room,
    feeShannons: BigInt(room.feeShannons),
    potShannons: BigInt(room.potShannons),
    questions: room.questions.map((question) => ({
      ...question,
      salt: saltFromHex(question.salt),
    })),
    matchId: room.matchId ?? null,
    hostLockHash: room.hostLockHash ?? null,
    hostLock: room.hostLock ?? null,
    matchOutPoint: room.matchOutPoint ?? null,
    treasuryOutPoint: room.treasuryOutPoint ?? null,
    bidOutPoint: room.bidOutPoint ?? null,
    kingLock: room.kingLock ?? null,
    pendingTx: room.pendingTx ?? null,
    pendingKind: room.pendingKind ?? null,
    hostAddress: room.hostAddress ?? null,
    answersOnServer: room.answersOnServer ?? false,
    durationMs: room.durationMs || DEFAULT_DURATION_MS,
  };
}

function readAll(): CrownRoom[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StoredRoom[];
    return parsed.map(fromStored);
  } catch {
    return [];
  }
}

function writeAll(rooms: CrownRoom[]) {
  window.localStorage.setItem(KEY, JSON.stringify(rooms.map(toStored)));
}

const listeners = new Set<() => void>();

export function subscribeCrowns(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

export function listCrowns(): CrownRoom[] {
  return readAll().sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0));
}

export function loadCrown(id: string): CrownRoom | null {
  return readAll().find((room) => room.id === id) ?? null;
}

export function saveCrown(room: CrownRoom) {
  const next = readAll().filter((item) => item.id !== room.id);
  next.unshift(room);
  writeAll(next);
  emit();
}

export function forgetCrown(id: string) {
  writeAll(readAll().filter((room) => room.id !== id));
  emit();
}

export function ckbWhole(shannons: bigint): string {
  const whole = shannons / 100_000_000n;
  const rest = shannons % 100_000_000n;
  if (rest === 0n) return whole.toString();
  return (Number(shannons) / 100_000_000).toFixed(2);
}

function crownId(): string {
  return `crown-${Math.random().toString(36).slice(2, 10)}`;
}

export function sealCrown(bank: QuestionBank): CrownRoom {
  const room: CrownRoom = {
    id: crownId(),
    title: bank.title,
    feeShannons: bank.feeShannons,
    durationMs: bank.durationMs || DEFAULT_DURATION_MS,
    questions: bank.questions,
    status: 'lobby',
    round: 0,
    cursor: 0,
    potShannons: 0n,
    king: null,
    openedAt: null,
    deadlineAt: null,
    feed: [],
    seals: [],
    matchId: null,
    hostLockHash: null,
    hostLock: null,
    matchOutPoint: null,
    treasuryOutPoint: null,
    bidOutPoint: null,
    kingLock: null,
    pendingTx: null,
    pendingKind: null,
    hostAddress: null,
    answersOnServer: false,
  };
  saveCrown(room);
  return room;
}

export function sealFloorCrown(): CrownRoom {
  return sealCrown(DEFAULT_BANK);
}

export function kickoff(room: CrownRoom, deadlineAt = Date.now() + (room.durationMs || DEFAULT_DURATION_MS)): CrownRoom {
  const now = Date.now();
  return {
    ...room,
    status: 'live',
    round: 1,
    cursor: 0,
    potShannons: 0n,
    king: null,
    openedAt: now,
    deadlineAt,
    feed: [
      {
        id: `${now}`,
        text: 'Clock started. The countdown is the deadline written in the match cell.',
        good: true,
      },
      ...room.feed,
    ].slice(0, 8),
  };
}

export function settleCrown(room: CrownRoom, reason: string): CrownRoom {
  if (room.status === 'settled') return room;
  const now = Date.now();
  return {
    ...room,
    status: 'settled',
    deadlineAt: room.deadlineAt ?? now,
    feed: [{ id: `${now}`, text: reason, good: Boolean(room.king) }, ...room.feed].slice(0, 8),
  };
}

export function applySteal(room: CrownRoom, proofNote: string): CrownRoom {
  const cut = shrinkMs(room.round);
  const fee = ckbWhole(room.feeShannons);
  const now = Date.now();
  const nextCursor = room.cursor + 1;
  const bankDone = nextCursor >= room.questions.length;
  const deadlineAt = shrunkDeadline(room.deadlineAt ?? now, room.round);
  const seal: CrownSeal = {
    id: `${now}`,
    label: 'Steal',
    detail: proofNote,
    txHash: null,
  };
  const stolen: CrownRoom = {
    ...room,
    round: room.round + 1,
    cursor: nextCursor,
    potShannons: room.potShannons + room.feeShannons,
    king: 'You',
    deadlineAt,
    seals: [seal, ...room.seals].slice(0, 8),
    feed: [
      {
        id: `${now}`,
        text: `Steal · +${fee} CKB · −${Math.round(cut / 60_000)} min on the clock`,
        good: true,
      },
      ...room.feed,
    ].slice(0, 8),
  };
  if (!bankDone || room.matchId) return stolen;
  return settleCrown(
    stolen,
    'The bank is finished. On a live cell the deadline would still be whatever the last steal wrote.',
  );
}

export function noteMiss(room: CrownRoom): CrownRoom {
  const now = Date.now();
  return {
    ...room,
    feed: [
      {
        id: `${now}`,
        text: 'Miss. That question is closed for them. The cell does not move.',
        good: false,
      },
      ...room.feed,
    ].slice(0, 8),
  };
}
