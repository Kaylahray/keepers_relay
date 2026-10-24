import { shrinkMs, shrunkDeadline } from '@/lib/sudden-death/codec';

const KEY = 'keepers-crowns';

/** Host-stamped length when a crown does not set one. Steals cut 10, 5, 5, 2.5… minutes, so 30 bites. */
export const DEFAULT_DURATION_MS = 30 * 60 * 1000;

/** Games a crown can be played with. Each is a game script the match cell names by data hash. */
export type GameId = 'lane-runner';

export const GAMES: Record<GameId, { title: string; blurb: string }> = {
  'lane-runner': {
    title: 'Lane Runner',
    blurb: 'Three lanes, rows of blocks, faster every few seconds. Survive and grab coins. Two minutes at most.',
  },
};

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
  game: GameId;
  status: CrownStatus;
  round: number;
  potShannons: bigint;
  king: string | null;
  /** The score a run has to beat to take the crown. Read from the match cell. */
  kingScore: number;
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
  /** The king's lock hash as the match cell records it. The server names the king from this. */
  kingHash?: string | null;
  hostAddress: string | null;
  /**
   * When this browser sent a steal that the chain has not confirmed yet. It lets the player who
   * took the crown see it straight away, and nothing more: the moment the server reads the new
   * round, the shared clock takes over again.
   */
  stealPendingAt?: number | null;
  /** A quiz crown from before version 2. The current scripts cannot play or close it. */
  legacy?: boolean;
};

export type StoredRoom = Omit<CrownRoom, 'feeShannons' | 'potShannons'> & {
  feeShannons: string;
  potShannons: string;
};

export function roomToStored(room: CrownRoom): StoredRoom {
  return {
    ...room,
    feeShannons: room.feeShannons.toString(),
    potShannons: room.potShannons.toString(),
  };
}

export function roomFromStored(room: StoredRoom): CrownRoom {
  const raw = room as StoredRoom & { questions?: unknown };
  return {
    id: room.id,
    title: room.title,
    feeShannons: BigInt(room.feeShannons),
    potShannons: BigInt(room.potShannons),
    durationMs: room.durationMs || DEFAULT_DURATION_MS,
    game: room.game ?? 'lane-runner',
    status: room.status,
    round: room.round ?? 0,
    king: room.king ?? null,
    kingScore: room.kingScore ?? 0,
    openedAt: room.openedAt ?? null,
    deadlineAt: room.deadlineAt ?? null,
    feed: room.feed ?? [],
    seals: room.seals ?? [],
    matchId: room.matchId ?? null,
    hostLockHash: room.hostLockHash ?? null,
    hostLock: room.hostLock ?? null,
    matchOutPoint: room.matchOutPoint ?? null,
    treasuryOutPoint: room.treasuryOutPoint ?? null,
    bidOutPoint: room.bidOutPoint ?? null,
    kingLock: room.kingLock ?? null,
    kingHash: room.kingHash ?? null,
    hostAddress: room.hostAddress ?? null,
    stealPendingAt: room.stealPendingAt ?? null,
    legacy: room.legacy ?? (!room.game && Array.isArray(raw.questions)),
  };
}

/** The raw stored list, for useSyncExternalStore: a string, so unchanged storage compares equal. */
export function storedCrownsRaw(): string {
  return window.localStorage.getItem(KEY) ?? '';
}

/** Storage changes from other tabs. Changes from this tab show on the next render anyway. */
export function subscribeCrownStorage(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

function readAll(): CrownRoom[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StoredRoom[];
    return parsed.map(roomFromStored);
  } catch {
    return [];
  }
}

function writeAll(rooms: CrownRoom[]) {
  window.localStorage.setItem(KEY, JSON.stringify(rooms.map(roomToStored)));
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
  return readAll()
    .filter((room) => !room.legacy)
    .sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0));
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

export type CrownSetup = {
  title: string;
  feeShannons: bigint;
  durationMs: number;
  game: GameId;
};

/** A practice floor anyone can open: no stake beyond the entry fee, the default clock. */
export const FLOOR_CROWN: CrownSetup = {
  title: 'Lane Runner floor',
  feeShannons: 50n * 100_000_000n,
  durationMs: DEFAULT_DURATION_MS,
  game: 'lane-runner',
};

export function sealCrown(setup: CrownSetup): CrownRoom {
  const room: CrownRoom = {
    id: crownId(),
    title: setup.title,
    feeShannons: setup.feeShannons,
    durationMs: setup.durationMs || DEFAULT_DURATION_MS,
    game: setup.game,
    status: 'lobby',
    round: 0,
    potShannons: 0n,
    king: null,
    kingScore: 0,
    openedAt: null,
    deadlineAt: null,
    stealPendingAt: null,
    feed: [],
    seals: [],
    matchId: null,
    hostLockHash: null,
    hostLock: null,
    matchOutPoint: null,
    treasuryOutPoint: null,
    bidOutPoint: null,
    kingLock: null,
    hostAddress: null,
  };
  saveCrown(room);
  return room;
}

export function kickoff(room: CrownRoom, deadlineAt = Date.now() + (room.durationMs || DEFAULT_DURATION_MS)): CrownRoom {
  const now = Date.now();
  return {
    ...room,
    status: 'live',
    round: 1,
    potShannons: 0n,
    king: null,
    kingScore: 0,
    openedAt: now,
    deadlineAt,
    stealPendingAt: null,
    feed: [
      {
        id: `${now}`,
        text: 'Clock started.',
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

/** A run took the crown. `king` is how the new holder is shown to everyone else. */
export function applySteal(room: CrownRoom, score: number, king: string, note: string): CrownRoom {
  const cut = shrinkMs(room.round);
  const fee = ckbWhole(room.feeShannons);
  const now = Date.now();
  const deadlineAt = shrunkDeadline(room.deadlineAt ?? now, room.round);
  return {
    ...room,
    round: room.round + 1,
    potShannons: room.potShannons + room.feeShannons,
    king,
    kingScore: score,
    deadlineAt,
    stealPendingAt: now,
    seals: [{ id: `${now}`, label: 'Crown', detail: note, txHash: null }, ...room.seals].slice(0, 8),
    feed: [
      {
        id: `${now}`,
        text: `${king} took the crown with ${score} · +${fee} CKB · −${Math.round(cut / 6_000) / 10} min on the clock`,
        good: true,
      },
      ...room.feed,
    ].slice(0, 8),
  };
}
