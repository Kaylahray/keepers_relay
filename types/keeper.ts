export type ArtifactKind = 'message' | 'meme' | 'rule' | 'view' | 'stamp';

export interface ArtifactEntry {
  id: string;
  author: string;
  kind: ArtifactKind;
  body: string;
  createdAt: string;
  isFeatured: boolean;
  /** Optional city / place stamp for the journey map. */
  place?: string;
}

export interface LivingArtifact {
  id: string;
  title: string;
  prompt: string;
  entries: ArtifactEntry[];
}

export type RelayCategory = 'Learn' | 'Explore' | 'Create';

/** How a Keeper proves they actually did the mission. */
export type RelayProofType = 'link' | 'tx-hash' | 'note';

/** Auto-checked proofs settle quickly; manual ones sit in a review queue. */
export type RelayReviewMode = 'auto' | 'manual';

export interface Relay {
  id: string;
  partner: string;
  partnerUrl: string;
  title: string;
  description: string;
  category: RelayCategory;
  rewardXp: number;
  rewardLabel: string;
  participantCount: number;
  /** Why this mission matters to the CKB ecosystem. */
  intent: string;
  /** Ordered steps shown on the relay detail page. */
  instructions: string[];
  eligibility: string;
  estimatedMinutes: number;
  proofType: RelayProofType;
  proofLabel: string;
  proofPlaceholder: string;
  reviewMode: RelayReviewMode;
}

export interface RelayBoard {
  activeRelayId: string;
  relays: Relay[];
}

/**
 * Lifecycle of one person's run at one Relay.
 *
 * started → submitted → verified → claimed, with `rejected` for failed review.
 */
export type RelayAttemptStatus =
  | 'not_started'
  | 'started'
  | 'submitted'
  | 'verified'
  | 'claimed'
  | 'rejected';

export interface RelayAttempt {
  relayId: string;
  status: RelayAttemptStatus;
  proof: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  claimedAt: string | null;
  reviewerNote: string | null;
  /** ISO timestamp the mock verifier will settle a submitted proof. */
  reviewEta: string | null;
}

export interface RelayDetail {
  relay: Relay;
  attempt: RelayAttempt;
  isActive: boolean;
}

export interface QueueEntry {
  id: string;
  name: string;
  pledge: string;
  joinedAt: string;
  endorsements: number;
  status: 'waiting' | 'endorsed';
}

export interface PassportProfile {
  address: string;
  displayName: string;
  /** Chosen cast member — null until onboarding finishes. */
  characterId: string | null;
  relayStreak: number;
  contributionXp: number;
  completedRelayIds: string[];
  artifactCount: number;
  badgeLabels: string[];
  keeperTurns: number;
}
