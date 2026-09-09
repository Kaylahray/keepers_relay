/** A persistent social group that hosts Events (Community = the room). */

export interface Community {
  id: string;
  /** URL slug — `/communities/[slug]` */
  slug: string;
  name: string;
  blurb: string;
  coverImageUrl: string;
  /** Official / curated communities. */
  featured: boolean;
  creatorAddress: string;
  creatorName: string;
  memberAddresses: string[];
  createdAt: string;
}

export type CommunitySummary = {
  id: string;
  slug: string;
  name: string;
  blurb: string;
  coverImageUrl: string;
  featured: boolean;
  memberCount: number;
  liveEventCount: number;
  creatorName: string;
  creatorAddress: string;
  createdAt: string;
  isMember: boolean;
};

export type CommunityMember = {
  address: string;
  displayName: string;
  username: string;
  headline?: string;
  avatarUrl?: string | null;
  characterId?: string | null;
  role: 'creator' | 'member';
  eventsPlayed?: number;
  wins?: number;
};

/** @deprecated handoffs belonged to the old Cell collectible product. */
export type HandoffRequest = {
  id: string;
  journeyId: string;
  communityId: string;
  requesterAddress: string;
  requesterName: string;
  note: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: string;
};
