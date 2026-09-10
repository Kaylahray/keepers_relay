/**
 * Communities + builders — Neon is the only source of truth.
 * Replaces the old in-memory `store.ts` social surface.
 */

import { CHARACTERS } from '@/lib/characters';
import { resolveCover } from '@/lib/poster';
import {
  ensureSocialTables,
  loadSocialState,
  saveSocialState,
  type SocialState,
} from '@/lib/db/social';
import { databaseConfigured } from '@/lib/db/client';
import { listEventsForCommunity } from '@/lib/server/events-store';
import { ApiError } from '@/lib/server/errors';
import {
  normalizeUsername,
  validateUsername,
} from '@/lib/rewards/milestones';
import type { BuilderProfile, UpsertBuilderInput } from '@/types/builder';
import type {
  Community,
  CommunityMember,
  CommunitySummary,
} from '@/types/community';

function emptyState(): SocialState {
  return { builders: {}, communities: {} };
}

async function loadOrEmpty(): Promise<SocialState> {
  if (!databaseConfigured()) {
    throw new ApiError(
      'DATABASE_URL is required. Social data lives in Neon, not a local store.',
      503,
    );
  }
  await ensureSocialTables();
  return (await loadSocialState()) ?? emptyState();
}

async function persist(state: SocialState): Promise<void> {
  await saveSocialState(state);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function toCommunitySummary(
  community: Community,
  viewerAddress?: string | null,
): CommunitySummary {
  const communityEvents = listEventsForCommunity(community.id);
  const liveEventCount = communityEvents.filter(
    (e) => e.status === 'live' || e.status === 'ready' || e.status === 'registration',
  ).length;
  return {
    id: community.id,
    slug: community.slug,
    name: community.name,
    blurb: community.blurb,
    coverImageUrl: resolveCover(community.coverImageUrl, community.name),
    featured: community.featured,
    memberCount: community.memberAddresses.length,
    liveEventCount,
    creatorName: community.creatorName,
    creatorAddress: community.creatorAddress,
    createdAt: community.createdAt,
    isMember: viewerAddress
      ? community.memberAddresses.some(
          (a) => a.toLowerCase() === viewerAddress.toLowerCase(),
        )
      : false,
  };
}

export async function listCommunities(
  viewerAddress?: string | null,
): Promise<CommunitySummary[]> {
  const s = await loadOrEmpty();
  return Object.values(s.communities)
    .map((c) => toCommunitySummary(c, viewerAddress))
    .sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

export async function getCommunityBySlug(
  slug: string,
  viewerAddress?: string | null,
): Promise<{
  community: CommunitySummary;
  events: import('@/types/event').EventSummary[];
  members: CommunityMember[];
}> {
  const s = await loadOrEmpty();
  const community = Object.values(s.communities).find((c) => c.slug === slug);
  if (!community) throw new ApiError('Community not found.', 404);

  const events = listEventsForCommunity(community.id);
  const members = community.memberAddresses.map((address) => {
    const builder = s.builders[address];
    return {
      address,
      displayName: builder?.displayName ?? address.slice(0, 10),
      username: builder?.username ?? '',
      headline: builder?.headline,
      avatarUrl: null,
      characterId: builder?.characterId ?? null,
      role: (address === community.creatorAddress ? 'creator' : 'member') as
        | 'creator'
        | 'member',
      eventsPlayed: 0,
      wins: 0,
    };
  });

  return {
    community: toCommunitySummary(community, viewerAddress),
    events,
    members,
  };
}

export async function createCommunity(input: {
  address: string;
  name: string;
  blurb: string;
  coverImageUrl?: string;
}): Promise<CommunitySummary> {
  const s = await loadOrEmpty();
  const builder = s.builders[input.address];
  if (!builder?.onboarded) {
    throw new ApiError('Finish onboarding before creating a community.', 403);
  }

  const name = input.name.trim();
  const blurb = input.blurb.trim();
  if (name.length < 2 || name.length > 40) {
    throw new ApiError('Community name must be 2–40 characters.');
  }
  if (blurb.length < 8 || blurb.length > 180) {
    throw new ApiError('Blurb must be 8–180 characters.');
  }

  let slug = slugify(name) || `room-${Date.now().toString(36)}`;
  if (Object.values(s.communities).some((c) => c.slug === slug)) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`;
  }

  const id = `comm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  const community: Community = {
    id,
    slug,
    name,
    blurb,
    coverImageUrl: input.coverImageUrl?.trim() || '',
    featured: false,
    creatorAddress: input.address,
    creatorName: builder.displayName,
    memberAddresses: [input.address],
    createdAt: new Date().toISOString(),
  };
  s.communities[id] = community;
  await persist(s);
  return toCommunitySummary(community, input.address);
}

export async function joinCommunity(
  slug: string,
  address: string,
  invitedByAddress?: string,
): Promise<CommunitySummary> {
  const s = await loadOrEmpty();
  const builder = s.builders[address];
  if (!builder?.onboarded) {
    throw new ApiError('Finish onboarding before joining a community.', 403);
  }
  const community = Object.values(s.communities).find((c) => c.slug === slug);
  if (!community) throw new ApiError('Community not found.', 404);

  if (!community.memberAddresses.some((a) => a.toLowerCase() === address.toLowerCase())) {
    community.memberAddresses.push(address);
  }
  if (invitedByAddress && !builder.invitedByAddress) {
    builder.invitedByAddress = invitedByAddress;
    s.builders[address] = builder;
  }
  await persist(s);
  return toCommunitySummary(community, address);
}

export async function leaveCommunity(
  slug: string,
  address: string,
): Promise<CommunitySummary> {
  const s = await loadOrEmpty();
  const community = Object.values(s.communities).find((c) => c.slug === slug);
  if (!community) throw new ApiError('Community not found.', 404);
  if (community.featured && community.creatorAddress === address) {
    throw new ApiError('Featured community creators can’t leave the room.', 409);
  }
  community.memberAddresses = community.memberAddresses.filter(
    (a) => a.toLowerCase() !== address.toLowerCase(),
  );
  await persist(s);
  return toCommunitySummary(community, address);
}

export async function grantCommunityPoints(input: {
  adminAddress: string;
  slug: string;
  recipientAddress: string;
  amount: number;
  note?: string;
}): Promise<{ recipient: BuilderProfile; amount: number }> {
  const s = await loadOrEmpty();
  const admin = s.builders[input.adminAddress];
  if (!admin?.onboarded) throw new ApiError('Finish onboarding first.', 403);
  const community = Object.values(s.communities).find((c) => c.slug === input.slug);
  if (!community) throw new ApiError('Community not found.', 404);
  if (community.creatorAddress.toLowerCase() !== input.adminAddress.toLowerCase()) {
    throw new ApiError('Only the community creator can grant points here.', 403);
  }
  const amount = Math.floor(input.amount);
  if (amount < 1 || amount > 10_000) {
    throw new ApiError('Grant between 1 and 10,000 points.');
  }
  const recipient = s.builders[input.recipientAddress];
  if (!recipient?.onboarded) {
    throw new ApiError('Recipient must be an onboarded builder.', 404);
  }
  if (
    !community.memberAddresses.some(
      (a) => a.toLowerCase() === input.recipientAddress.toLowerCase(),
    )
  ) {
    throw new ApiError('Recipient must be a member of this community.', 403);
  }
  recipient.pointsBalance = (recipient.pointsBalance ?? 0) + amount;
  recipient.lastSeenAt = new Date().toISOString();
  s.builders[recipient.address] = recipient;
  await persist(s);
  void input.note;
  return { recipient, amount };
}

export async function listBuilders(): Promise<BuilderProfile[]> {
  const s = await loadOrEmpty();
  return Object.values(s.builders)
    .filter((builder) => builder.onboarded)
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
}

export async function getBuilder(address: string): Promise<BuilderProfile | null> {
  const s = await loadOrEmpty();
  return s.builders[address] ?? null;
}

export async function checkUsernameAvailable(
  usernameRaw: string,
  exceptAddress?: string,
): Promise<{ username: string; available: boolean; reason: string | null }> {
  const username = normalizeUsername(usernameRaw);
  const reason = validateUsername(username);
  if (reason) return { username, available: false, reason };

  const s = await loadOrEmpty();
  const taken = Object.values(s.builders).find(
    (builder) =>
      builder.onboarded &&
      builder.username === username &&
      (!exceptAddress || builder.address !== exceptAddress),
  );
  if (taken) {
    return { username, available: false, reason: 'That username is already taken.' };
  }
  return { username, available: true, reason: null };
}

export async function upsertBuilder(input: UpsertBuilderInput): Promise<BuilderProfile> {
  const s = await loadOrEmpty();
  const address = input.address.trim();
  const displayName = input.displayName.trim();
  const usernameCheck = await checkUsernameAvailable(input.username, address);
  const characterId = input.characterId ?? null;
  const headline = (input.headline ?? '').trim();

  if (!address) throw new ApiError('Connect a wallet before creating a profile.');
  if (!usernameCheck.available) {
    throw new ApiError(usernameCheck.reason ?? 'Username unavailable.', 409);
  }
  if (!displayName) throw new ApiError('Pick a display name the crew can call you.');
  if (displayName.length > 24) throw new ApiError('Keep the name under 24 characters.');
  if (characterId && !CHARACTERS.some((character) => character.id === characterId)) {
    throw new ApiError('That character is not in the cast.');
  }

  const now = new Date().toISOString();
  const previous = s.builders[address];
  const builder: BuilderProfile = {
    address,
    username: usernameCheck.username,
    displayName,
    characterId,
    avatarSporeId:
      input.avatarSporeId !== undefined
        ? input.avatarSporeId
        : (previous?.avatarSporeId ?? null),
    headline: headline || 'A CKB builder keeping the chain alive.',
    joinedAt: previous?.joinedAt ?? now,
    lastSeenAt: now,
    onboarded: true,
    pointsBalance: previous?.pointsBalance ?? 0,
    claimedMilestones: previous?.claimedMilestones ?? [],
    claimedBadgeIds: previous?.claimedBadgeIds ?? [],
    invitedByAddress: previous?.invitedByAddress ?? null,
    lastRescueAt: previous?.lastRescueAt ?? null,
  };

  s.builders[address] = builder;
  await persist(s);
  return builder;
}

export async function touchBuilder(address: string): Promise<BuilderProfile | null> {
  const s = await loadOrEmpty();
  const builder = s.builders[address];
  if (!builder) return null;
  builder.lastSeenAt = new Date().toISOString();
  s.builders[address] = builder;
  await persist(s);
  return builder;
}

export async function setBuilderAvatar(
  address: string,
  avatarSporeId: string | null,
): Promise<BuilderProfile> {
  const s = await loadOrEmpty();
  const builder = s.builders[address];
  if (!builder?.onboarded) {
    throw new ApiError('Finish onboarding before setting an avatar.', 403);
  }
  builder.avatarSporeId = avatarSporeId;
  builder.lastSeenAt = new Date().toISOString();
  s.builders[address] = builder;
  await persist(s);
  return builder;
}

export async function clearBuilderAvatarIfMatches(
  address: string,
  sporeId: string,
): Promise<BuilderProfile | null> {
  const s = await loadOrEmpty();
  const builder = s.builders[address];
  if (!builder) return null;
  if (builder.avatarSporeId !== sporeId) return builder;
  builder.avatarSporeId = null;
  s.builders[address] = builder;
  await persist(s);
  return builder;
}

export async function releaseBuilderHandle(address: string): Promise<BuilderProfile | null> {
  const s = await loadOrEmpty();
  const builder = s.builders[address];
  if (!builder) return null;
  builder.username = '';
  builder.onboarded = false;
  builder.lastSeenAt = new Date().toISOString();
  s.builders[address] = builder;
  await persist(s);
  return builder;
}

export async function unlockBadge(
  address: string,
  badgeId: string,
): Promise<BuilderProfile> {
  const { KEEPER_BADGES } = await import('@/lib/rewards/milestones');
  const s = await loadOrEmpty();
  const builder = s.builders[address];
  if (!builder?.onboarded) {
    throw new ApiError('Onboard before unlocking badges.', 403);
  }
  const badge = KEEPER_BADGES.find((b) => b.id === badgeId);
  if (!badge) throw new ApiError('Unknown badge.', 404);
  if (builder.claimedBadgeIds.includes(badgeId)) {
    throw new ApiError('You already unlocked this badge.', 409);
  }
  if (builder.pointsBalance < badge.requiredPoints) {
    throw new ApiError(`Need ${badge.requiredPoints} pts to unlock ${badge.name}.`, 409);
  }
  builder.claimedBadgeIds = [...builder.claimedBadgeIds, badgeId];
  s.builders[address] = builder;
  await persist(s);
  return builder;
}

/** Minimal passport shape for profile UI — derived from builder, not old store. */
export async function getPassport(address?: string): Promise<{
  address: string;
  displayName: string;
  characterId: string | null;
  relayStreak: number;
  contributionXp: number;
  completedRelayIds: string[];
  artifactCount: number;
  badgeLabels: string[];
  keeperTurns: number;
  keeperPassStreak: number;
  longestKeeperPassStreak: number;
}> {
  if (!address) {
    return {
      address: '',
      displayName: 'Keeper',
      characterId: null,
      relayStreak: 0,
      contributionXp: 0,
      completedRelayIds: [],
      artifactCount: 0,
      badgeLabels: [],
      keeperTurns: 0,
      keeperPassStreak: 0,
      longestKeeperPassStreak: 0,
    };
  }
  const builder = await getBuilder(address);
  return {
    address,
    displayName: builder?.displayName ?? 'Keeper',
    characterId: builder?.characterId ?? null,
    relayStreak: 0,
    contributionXp: builder?.pointsBalance ?? 0,
    completedRelayIds: [],
    artifactCount: 0,
    badgeLabels: builder?.onboarded ? ['Joined the relay'] : [],
    keeperTurns: 0,
    keeperPassStreak: 0,
    longestKeeperPassStreak: 0,
  };
}

export async function findCommunityName(communityId: string): Promise<string | null> {
  const s = await loadOrEmpty().catch(() => null);
  return s?.communities[communityId]?.name ?? null;
}

export async function findCommunitySlug(communityId: string): Promise<string | null> {
  const s = await loadOrEmpty().catch(() => null);
  return s?.communities[communityId]?.slug ?? null;
}
