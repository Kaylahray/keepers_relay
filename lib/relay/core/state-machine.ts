/**
 * @relay/core — Stateful Event Engine primitives.
 *
 * Pure TypeScript. No Next.js, no Neon, no wallet.
 * Extractable later as `@relay-ckb/core`.
 *
 * Mental model (grant / 1–23 brief):
 *   Modes = rules on shared primitives
 *   Event config · Player stake · Turn baton · Sponsor · Claim
 */

export type EventStatus =
  | 'registration'
  | 'ready'
  | 'live'
  | 'paused'
  | 'finished'
  | 'settled';

export type EventPlayerStatus =
  | 'registered'
  | 'active'
  | 'waiting'
  | 'eliminated'
  | 'finished'
  | 'winner';

export type TurnState = 'pending' | 'answered' | 'timed_out' | 'passed';

/** Game modes are configurations — not separate Cell types. */
export type EventMode =
  | 'rapid_qa'
  | 'survival'
  | 'shrinking_clock'
  | 'pot_rush'
  | 'knowledge_battle'
  | 'creative_challenge'
  | 'rescue'
  | 'chain';

/** Allowed Event status edges. Scripts + server must share this table. */
export const EVENT_STATUS_TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  registration: ['ready', 'live'], // live only via schedule path after ready checks
  ready: ['live', 'registration'],
  live: ['paused', 'finished'],
  paused: ['live', 'finished'],
  finished: ['settled'],
  settled: [],
} as const;

export function canTransitionEventStatus(from: EventStatus, to: EventStatus): boolean {
  if (from === to) return true;
  return EVENT_STATUS_TRANSITIONS[from].includes(to);
}

export function assertEventStatusTransition(from: EventStatus, to: EventStatus): void {
  if (!canTransitionEventStatus(from, to)) {
    throw new Error(`Illegal event status transition: ${from} → ${to}`);
  }
}

/** Pot display = host seed + stakes + sponsors + mode bonus. Not one mutable pot Cell. */
export function computeDisplayedPot(input: {
  startingPot: number;
  playerStakes: number[];
  sponsorAmounts: number[];
  bonusPot?: number;
}): number {
  const stakes = input.playerStakes.reduce((s, n) => s + n, 0);
  const sponsors = input.sponsorAmounts.reduce((s, n) => s + n, 0);
  return Math.max(0, input.startingPot) + stakes + sponsors + Math.max(0, input.bonusPot ?? 0);
}

/** Mode rule hooks — pure helpers the turn engine calls. */
export type ModeRules = {
  id: EventMode;
  /** Points awarded on correct answer (ranking only). */
  pointsOnCorrect: number;
  /** Extra pot bonus CKB on correct (Pot Rush). */
  potBonusOnCorrect: number;
  /** Eliminate on wrong / timeout. */
  eliminateOnMiss: boolean;
  /** Shrink turn window each round (basis: opening turnSecs). */
  shrinkTurnSecs: boolean;
};

export const MODE_RULES: Record<EventMode, ModeRules> = {
  rapid_qa: {
    id: 'rapid_qa',
    pointsOnCorrect: 10,
    potBonusOnCorrect: 0,
    eliminateOnMiss: false,
    shrinkTurnSecs: false,
  },
  survival: {
    id: 'survival',
    pointsOnCorrect: 10,
    potBonusOnCorrect: 0,
    eliminateOnMiss: true,
    shrinkTurnSecs: false,
  },
  shrinking_clock: {
    id: 'shrinking_clock',
    pointsOnCorrect: 10,
    potBonusOnCorrect: 0,
    eliminateOnMiss: false,
    shrinkTurnSecs: true,
  },
  pot_rush: {
    id: 'pot_rush',
    pointsOnCorrect: 10,
    potBonusOnCorrect: 2,
    eliminateOnMiss: false,
    shrinkTurnSecs: false,
  },
  knowledge_battle: {
    id: 'knowledge_battle',
    pointsOnCorrect: 12,
    potBonusOnCorrect: 0,
    eliminateOnMiss: false,
    shrinkTurnSecs: false,
  },
  creative_challenge: {
    id: 'creative_challenge',
    pointsOnCorrect: 10,
    potBonusOnCorrect: 0,
    eliminateOnMiss: false,
    shrinkTurnSecs: false,
  },
  rescue: {
    id: 'rescue',
    pointsOnCorrect: 10,
    potBonusOnCorrect: 0,
    eliminateOnMiss: false,
    shrinkTurnSecs: false,
  },
  chain: {
    id: 'chain',
    pointsOnCorrect: 0,
    potBonusOnCorrect: 0,
    eliminateOnMiss: false,
    shrinkTurnSecs: false,
  },
};

export function turnSecsForRound(mode: EventMode, baseSecs: number, round: number): number {
  const rules = MODE_RULES[mode];
  if (!rules.shrinkTurnSecs) return Math.max(5, baseSecs);
  const decayed = Math.floor(baseSecs * Math.pow(0.85, Math.max(0, round - 1)));
  return Math.max(5, decayed);
}

/** Resolve stacked play rules into engine knobs (modes are presets; rules stack). */
export function resolveStackedRules(input: {
  mode: EventMode;
  playRules?: {
    growingPot: boolean;
    winCondition: 'highest_score' | 'last_standing';
    shrinkingClock: boolean;
    accuracySpeed: boolean;
  };
}): {
  pointsOnCorrect: number;
  potBonusOnCorrect: number;
  eliminateOnMiss: boolean;
  shrinkTurnSecs: boolean;
  joinPotBump: number;
} {
  if (input.playRules) {
    const r = input.playRules;
    return {
      pointsOnCorrect: r.accuracySpeed ? 12 : 10,
      potBonusOnCorrect: r.growingPot ? 2 : 0,
      eliminateOnMiss: r.winCondition === 'last_standing',
      shrinkTurnSecs: r.shrinkingClock,
      joinPotBump: r.growingPot ? 1 : 0,
    };
  }
  const m = MODE_RULES[input.mode];
  return {
    pointsOnCorrect: m.pointsOnCorrect,
    potBonusOnCorrect: m.potBonusOnCorrect,
    eliminateOnMiss: m.eliminateOnMiss,
    shrinkTurnSecs: m.shrinkTurnSecs,
    joinPotBump: input.mode === 'pot_rush' ? 1 : 0,
  };
}

export function turnSecsForStackedRound(
  shrink: boolean,
  baseSecs: number,
  round: number,
): number {
  if (!shrink) return Math.max(5, baseSecs);
  const decayed = Math.floor(baseSecs * Math.pow(0.85, Math.max(0, round - 1)));
  return Math.max(5, decayed);
}

export function canJoinEvent(input: {
  status: EventStatus;
  playerCount: number;
  maxPlayers: number;
}): boolean {
  if (input.status !== 'registration' && input.status !== 'ready') return false;
  return input.playerCount < input.maxPlayers;
}

export function canStartEvent(input: {
  status: EventStatus;
  playerCount: number;
  minPlayers: number;
}): boolean {
  if (input.status === 'live' || input.status === 'finished' || input.status === 'settled') {
    return false;
  }
  return input.playerCount >= input.minPlayers;
}
