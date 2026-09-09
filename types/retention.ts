import type { JourneySummary } from '@/types/chain';
import type { ArtifactKind } from '@/types/keeper';

/** Passport point bonuses for keeping Cells alive (not login rewards). */
export const CRITICAL_SAVE_POINTS = 5;
export const INVITE_CREDIT_POINTS = 10;
export const RESCUE_POINTS = 8;
export const CRITICAL_WINDOW_MS = 2 * 60 * 60 * 1000;
/** Soft rescue extends the clock by this many hours (app rule; on-chain later). */
export const RESCUE_EXTEND_HOURS = 6;

export type HomeNoticeKind =
  | 'critical'
  | 'dead'
  | 'returned'
  | 'incoming'
  | 'pot_share'
  | 'streak_broken'
  | 'critical_save'
  | 'invite_credit'
  | 'rescued'
  | 'stake_entry'
  | 'stake_forfeit';

export interface HomeNotice {
  id: string;
  address: string;
  kind: HomeNoticeKind;
  journeyId?: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export interface MarkDraft {
  journeyId: string;
  address: string;
  body: string;
  kind: ArtifactKind;
  place?: string;
  imageUrl?: string;
  updatedAt: string;
}

export type HomeCardTone = 'holding' | 'incoming' | 'watching' | 'created';

export interface HomeStreakCard extends JourneySummary {
  tone: HomeCardTone;
  /** ms left; negative if overdue / dead. */
  msRemaining: number;
  critical: boolean;
  /** You asked for this Cell and are waiting. */
  pendingRequest?: boolean;
  /** Holder nominated you as next. */
  nominated?: boolean;
  /** You hold it and still need to seal. */
  needsMark?: boolean;
  /** Soft draft saved for this streak. */
  hasDraft?: boolean;
}

export interface HomeFeed {
  address: string;
  displayName: string;
  username: string;
  keeperPassStreak: number;
  longestKeeperPassStreak: number;
  pointsBalance: number;
  holding: HomeStreakCard[];
  incoming: HomeStreakCard[];
  created: HomeStreakCard[];
  watching: HomeStreakCard[];
  notices: HomeNotice[];
  unreadNoticeCount: number;
}
