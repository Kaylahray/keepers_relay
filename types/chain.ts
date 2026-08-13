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
   * Soft PROOF sitting in this journey's reward pot.
   * Later: real sUDT / treasury claim scripts.
   */
  rewardPoolProof: number;
  /** Optional note about what the pot is for. */
  rewardPoolNote?: string;
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
  rewardPoolProof: number;
  expiresAt: string;
  createdAt: string;
  coverImageUrl: string;
};

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

export const LAUNCH_PRESETS: {
  creatureName: string;
  seedPrompt: string;
  mode: ChainMode;
  trophyGoal: number;
  blurb: string;
}[] = [
  {
    creatureName: 'Window Relay',
    seedPrompt: 'Show me the view outside your window — one line, one place.',
    mode: 'return_home',
    trophyGoal: 50,
    blurb: 'A chain of windows across cities.',
  },
  {
    creatureName: 'Cell Scout',
    seedPrompt: 'Paste one real Cell explorer link and one sentence about what you noticed.',
    mode: 'open',
    trophyGoal: 100,
    blurb: 'Teach the Cell model by hunting real Cells.',
  },
  {
    creatureName: 'Spore Walk',
    seedPrompt: 'Name one Spore / DOB you visited and why it stuck with you.',
    mode: 'return_home',
    trophyGoal: 30,
    blurb: 'Digital objects, human taste.',
  },
  {
    creatureName: 'Fiber Pulse',
    seedPrompt: 'One sentence: what should Fiber make feel instant for builders?',
    mode: 'open',
    trophyGoal: 75,
    blurb: 'Speed dreams for the CKB stack.',
  },
  {
    creatureName: 'Trust Circle',
    seedPrompt:
      'Pass this only to someone you trust. Tell them one thing you wish someone told you.',
    mode: 'return_home',
    trophyGoal: 25,
    blurb: 'Intimate handoffs, no strangers.',
  },
  {
    creatureName: 'Docs Spark',
    seedPrompt: 'Quote one Nervos doc line that clicked — and rewrite it in your own words.',
    mode: 'open',
    trophyGoal: 40,
    blurb: 'Make the docs travel person to person.',
  },
];
