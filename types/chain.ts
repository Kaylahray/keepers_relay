export type ChainStatus = 'alive' | 'dead';

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
}

export interface Chain {
  id: string;
  status: ChainStatus;
  /** Ordered lineage, oldest first. The last entry is the current holder. */
  owners: Owner[];
  /** ISO timestamp the current holder must pass by, or it dies. */
  expiresAt: string;
  /** Window length in hours (24h or 7d = 168h). */
  windowHours: number;
  /** Owner count at which the chain becomes a permanent trophy. */
  trophyGoal: number;
  /** ISO timestamp the chain died, if it did. */
  diedAt: string | null;
}

export const TROPHY_GOAL = 500;
