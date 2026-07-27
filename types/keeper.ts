export type ArtifactKind = 'message' | 'meme' | 'rule';

export interface ArtifactEntry {
  id: string;
  author: string;
  kind: ArtifactKind;
  body: string;
  createdAt: string;
  isFeatured: boolean;
}

export interface LivingArtifact {
  id: string;
  title: string;
  prompt: string;
  entries: ArtifactEntry[];
}

export interface Relay {
  id: string;
  partner: string;
  title: string;
  description: string;
  category: 'Learn' | 'Explore' | 'Create';
  rewardXp: number;
  rewardLabel: string;
  participantCount: number;
}

export interface RelayBoard {
  activeRelayId: string;
  relays: Relay[];
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
  displayName: string;
  relayStreak: number;
  contributionXp: number;
  completedRelayIds: string[];
  artifactCount: number;
  badgeLabels: string[];
}
