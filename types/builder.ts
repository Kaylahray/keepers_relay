import type { CharacterId } from '@/lib/characters';
import type { RewardMilestone } from '@/lib/rewards/milestones';

/** Wallet-linked builder identity on Keepers Relay. */
export interface BuilderProfile {
  address: string;
  /** Unique @handle — roster identity. */
  username: string;
  displayName: string;
  characterId: CharacterId | null;
  /** On-chain Spore type args used as the profile picture. */
  avatarSporeId: string | null;
  headline: string;
  joinedAt: string;
  lastSeenAt: string;
  onboarded: boolean;
  /** Soft points balance (passport XP until treasury is wired). */
  pointsBalance: number;
  claimedMilestones: RewardMilestone[];
  claimedBadgeIds: string[];
  /** Set once when joining via an invite link — used for invite credit. */
  invitedByAddress?: string | null;
  /** ISO timestamp of last rescue — one soft rescue per day. */
  lastRescueAt?: string | null;
}

export interface UpsertBuilderInput {
  address: string;
  username: string;
  displayName: string;
  characterId?: CharacterId | null;
  headline?: string;
  avatarSporeId?: string | null;
}
