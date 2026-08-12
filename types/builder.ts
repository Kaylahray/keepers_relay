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
  /** Soft PROOF balance (mirrors Spore ID rewards until treasury is wired). */
  proofBalance: number;
  claimedMilestones: RewardMilestone[];
  claimedBadgeIds: string[];
}

export interface UpsertBuilderInput {
  address: string;
  username: string;
  displayName: string;
  characterId?: CharacterId | null;
  headline?: string;
  avatarSporeId?: string | null;
}
