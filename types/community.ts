/** A club where streaks (living Cells) live. */
export interface Community {
  id: string;
  /** URL slug — `/communities/[slug]` */
  slug: string;
  name: string;
  blurb: string;
  coverImageUrl: string;
  /** Official / curated rooms (Neon, CKB Main, etc.). */
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
  liveStreakCount: number;
  creatorName: string;
  creatorAddress: string;
  createdAt: string;
  isMember: boolean;
};

/** Member asks the current holder to pass them the Cell. */
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
