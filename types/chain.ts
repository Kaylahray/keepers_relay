export type ChainStatus = 'alive' | 'dead' | 'returned';

/** How the Cell is allowed to travel. */
export type ChainMode = 'open' | 'return_home';

export interface Owner {
  /** Stable id — in CKB terms, the cell created for this owner. */
  id: string;
  name: string;
  /** ISO timestamp the owner received the object. */
  receivedAt: string;
  /** ISO timestamp the owner passed it on — null while they still hold it. */
  passedAt: string | null;
  /** Short pseudo cell hash, purely cosmetic on-chain flavor. */
  cellHash: string;
  /** Optional place stamp when they received / held the Cell. */
  city?: string;
  /** Artifact entry id sealed during this hold (required before pass). */
  contributionId?: string | null;
  /** Wallet that held this turn, when known. */
  address?: string;
}

/**
 * Escalating-pot rules. Present only on stakes streaks.
 *
 * Every Keeper pays to receive the Cell, the pot grows, and the window shrinks
 * each hop so the streak always ends. Pass in time and you share the pot; be the
 * one who lets it die and your stake stays in.
 */
export interface StakesConfig {
  /** CKB the first receiving Keeper pays. */
  entryCkb: number;
  /** Percent the entry grows each handoff. */
  escalationPct: number;
  /** Percent the pass window shrinks each handoff. */
  decayPct: number;
  /** The window never falls below this many hours. */
  floorHours: number;
}

/** A paid seat in a stakes streak. */
export interface StakeEntry {
  address: string;
  name: string;
  /** Lineage position this seat was bought at. */
  hop: number;
  paid: number;
  at: string;
  /** True once this Keeper passed the Cell on in time. */
  survived: boolean;
}

export interface Chain {
  id: string;
  status: ChainStatus;
  /** Community this streak belongs to. */
  communityId: string;
  /** Ordered lineage, oldest first. The last entry is the current holder. */
  owners: Owner[];
  /** ISO timestamp the current holder must pass by, or it dies. */
  expiresAt: string;
  /** Window length in hours (24, 168, or 720). */
  windowHours: number;
  /** Live Chain Cell outpoint after testnet mint/handoff. */
  cellOutPoint?: { txHash: string; index: string };
  /** 32-byte chain_id stored in the Cell (0x-prefixed). */
  onChainChainId?: string;
  /** Genesis mint tx, when this streak is on-chain. */
  genesisTxHash?: string;
  /** Latest handoff/mint tx. */
  lastTxHash?: string;
  /**
   * Latest artifact_root commitment (0x + 64 hex).
   * Written into the Chain Cell on seal (script v2+) or on the next pass.
   */
  artifactRoot?: string;
  /** True once artifactRoot is on the live Cell (seal or pass commit). */
  artifactRootOnChain?: boolean;
  /** Owner count at which the chain becomes a permanent trophy. */
  trophyGoal: number;
  /** ISO timestamp the chain died, if it did. */
  diedAt: string | null;
  /** Who launched this Cell into the world. */
  creatorName: string;
  /** Wallet address of the launcher (when known). */
  creatorAddress?: string;
  /** Seed prompt that every holder answers / contributes to. */
  seedPrompt: string;
  /** open = free relay; return_home = unique holders only, then back to creator. */
  mode: ChainMode;
  /** Friendly name for this living journey / streak. */
  creatureName: string;
  /** Picture of this Cell — shown as the orb, cards, and boards. */
  coverImageUrl?: string;
  /** Set when a return_home Cell makes it back to its creator. */
  returnedAt: string | null;
  /** When this journey was launched. */
  createdAt: string;
  /**
   * CKB sitting in this journey's reward pot (mock balance until on-chain settle).
   */
  rewardPoolCkb: number;
  /** Optional note about what the pot is for. */
  rewardPoolNote?: string;
  /**
   * Soft “you’re next” nomination by the current holder.
   * Cleared on pass, death, or return.
   */
  nominatedNext?: {
    address: string;
    name: string;
    nominatedAt: string;
  } | null;
  /** How many times this Cell was rescued from a dying clock. */
  rescueCount?: number;
  lastRescuedAt?: string | null;
  lastRescuedBy?: string | null;
  /** Escalating-pot rules. Undefined on free streaks. */
  stakes?: StakesConfig;
  /** Paid seats, oldest first. */
  stakeEntries?: StakeEntry[];
}

export type JourneySummary = {
  id: string;
  communityId: string;
  communityName: string;
  communitySlug: string;
  creatureName: string;
  creatorName: string;
  seedPrompt: string;
  status: ChainStatus;
  mode: ChainMode;
  holderCount: number;
  currentHolder: string;
  trophyGoal: number;
  rewardPoolCkb: number;
  expiresAt: string;
  createdAt: string;
  coverImageUrl: string;
  stakes?: StakesConfig | null;
};

export const STAKES_DEFAULTS: StakesConfig = {
  entryCkb: 5,
  escalationPct: 15,
  decayPct: 12,
  floorHours: 1,
};

export function normalizeStakes(input: Partial<StakesConfig>): StakesConfig {
  const clamp = (value: number | undefined, min: number, max: number, fallback: number) =>
    Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value as number))) : fallback;
  return {
    entryCkb: clamp(input.entryCkb, 1, 1_000, STAKES_DEFAULTS.entryCkb),
    escalationPct: clamp(input.escalationPct, 0, 100, STAKES_DEFAULTS.escalationPct),
    // The contract refuses a stakes Cell whose window never shrinks, so the
    // floor here is 1, not 0 — otherwise a launch would mint and then fail.
    decayPct: clamp(input.decayPct, 1, 50, STAKES_DEFAULTS.decayPct),
    floorHours: clamp(input.floorHours, 1, 24, STAKES_DEFAULTS.floorHours),
  };
}

/** What the Keeper buying seat `hop` pays. Hop 0 is the creator's seed. */
export function stakesEntryAtHop(stakes: StakesConfig, hop: number): number {
  const steps = Math.max(0, hop - 1);
  const grown = stakes.entryCkb * (1 + stakes.escalationPct / 100) ** steps;
  return Math.max(1, Math.round(grown));
}

/** How long the Keeper at seat `hop` gets. Shrinks every hop down to the floor. */
export function stakesWindowHoursAtHop(
  stakes: StakesConfig,
  baseHours: number,
  hop: number,
): number {
  const shrunk = baseHours * (1 - stakes.decayPct / 100) ** Math.max(0, hop);
  return Math.max(stakes.floorHours, Math.round(shrunk * 100) / 100);
}

/**
 * Split a pot across survivors, weighted so the later you survived the more you
 * take. Remainder goes to the latest survivors first.
 */
export function stakesPayoutShares<T extends { address: string; name: string; hop: number }>(
  pot: number,
  survivors: T[],
): { address: string; name: string; amount: number }[] {
  if (pot <= 0 || survivors.length === 0) return [];
  const ordered = [...survivors].sort((a, b) => a.hop - b.hop);
  const totalWeight = (ordered.length * (ordered.length + 1)) / 2;
  const shares = ordered.map((survivor, index) => ({
    address: survivor.address,
    name: survivor.name,
    amount: Math.floor((pot * (index + 1)) / totalWeight),
  }));
  let remainder = pot - shares.reduce((sum, share) => sum + share.amount, 0);
  for (let i = shares.length - 1; i >= 0 && remainder > 0; i -= 1) {
    shares[i].amount += 1;
    remainder -= 1;
  }
  return shares;
}

export type CreatureStage = 'blob' | 'walker' | 'voyager' | 'legend';

export function creatureStageForHolders(count: number): CreatureStage {
  if (count >= 100) return 'legend';
  if (count >= 50) return 'voyager';
  if (count >= 10) return 'walker';
  return 'blob';
}

export const CREATURE_STAGE_LABEL: Record<CreatureStage, string> = {
  blob: 'Tiny blob',
  walker: 'Walker',
  voyager: 'Voyager',
  legend: 'Legend',
};

export const TROPHY_GOAL = 500;

