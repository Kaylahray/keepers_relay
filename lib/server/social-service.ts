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
import {
  listEventsForCommunity,
  passportStatsForAddress,
} from '@/lib/server/events-store';
import { normalizeAddress } from '@/lib/server/auth';
import { refreshCommunityIndexFromMap } from '@/lib/server/community-index';
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

function syncCommunityIndex(state: SocialState): void {
  refreshCommunityIndexFromMap(state.communities);
}

async function loadOrEmpty(): Promise<SocialState> {
  if (!databaseConfigured()) {
    throw new ApiError(
      'DATABASE_URL is required. Social data lives in Neon, not a local store.',
      503,
    );
  }
  await ensureSocialTables();
  const state = (await loadSocialState()) ?? emptyState();
  syncCommunityIndex(state);
  return state;
}

/** Load communities into the sync name/slug index (for event summaries). */
export async function refreshCommunityIndex(): Promise<void> {
  if (!databaseConfigured()) {
    refreshCommunityIndexFromMap({});
    return;
  }
  await ensureSocialTables();
  const state = (await loadSocialState()) ?? emptyState();
  syncCommunityIndex(state);
}

async function persist(state: SocialState): Promise<void> {
  await saveSocialState(state);
  syncCommunityIndex(state);
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
  const viewer = viewerAddress ? normalizeAddress(viewerAddress) : '';
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
    isMember: viewer
      ? community.memberAddresses.some((a) => normalizeAddress(a) === viewer)
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
    const key = normalizeAddress(address);
    const builder = s.builders[key] ?? s.builders[address];
    const stats = passportStatsForAddress(address);
    return {
      address: key || address,
      displayName: builder?.displayName ?? address.slice(0, 10),
      username: builder?.username ?? '',
      headline: builder?.headline,
      avatarUrl: null,
      characterId: builder?.characterId ?? null,
      role: (normalizeAddress(address) === normalizeAddress(community.creatorAddress)
        ? 'creator'
        : 'member') as 'creator' | 'member',
      eventsPlayed: stats.eventsPlayed,
      wins: stats.wins,
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
  const address = normalizeAddress(input.address);
  const builder = s.builders[address];
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
    creatorAddress: address,
    creatorName: builder.displayName,
    memberAddresses: [address],
    createdAt: new Date().toISOString(),
  };
  s.communities[id] = community;
  await persist(s);
  return toCommunitySummary(community, address);
}

export async function joinCommunity(
  slug: string,
  addressRaw: string,
  invitedByAddress?: string,
): Promise<CommunitySummary> {
  const s = await loadOrEmpty();
  const address = normalizeAddress(addressRaw);
  const builder = s.builders[address];
  if (!builder?.onboarded) {
    throw new ApiError('Finish onboarding before joining a community.', 403);
  }
  const community = Object.values(s.communities).find((c) => c.slug === slug);
  if (!community) throw new ApiError('Community not found.', 404);

  if (!community.memberAddresses.some((a) => normalizeAddress(a) === address)) {
    community.memberAddresses.push(address);
  }
  if (invitedByAddress && !builder.invitedByAddress) {
    builder.invitedByAddress = normalizeAddress(invitedByAddress);
    s.builders[address] = builder;
  }
  await persist(s);
  return toCommunitySummary(community, address);
}

export async function leaveCommunity(
  slug: string,
  addressRaw: string,
): Promise<CommunitySummary> {
  const s = await loadOrEmpty();
  const address = normalizeAddress(addressRaw);
  const community = Object.values(s.communities).find((c) => c.slug === slug);
  if (!community) throw new ApiError('Community not found.', 404);
  if (community.featured && normalizeAddress(community.creatorAddress) === address) {
    throw new ApiError('Featured community creators can’t leave the room.', 409);
  }
  community.memberAddresses = community.memberAddresses.filter(
    (a) => normalizeAddress(a) !== address,
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
  const adminAddress = normalizeAddress(input.adminAddress);
  const recipientAddress = normalizeAddress(input.recipientAddress);
  const admin = s.builders[adminAddress];
  if (!admin?.onboarded) throw new ApiError('Finish onboarding first.', 403);
  const community = Object.values(s.communities).find((c) => c.slug === input.slug);
  if (!community) throw new ApiError('Community not found.', 404);
  if (normalizeAddress(community.creatorAddress) !== adminAddress) {
    throw new ApiError('Only the community creator can grant points here.', 403);
  }
  const amount = Math.floor(input.amount);
  if (amount < 1 || amount > 10_000) {
    throw new ApiError('Grant between 1 and 10,000 points.');
  }
  const recipient = s.builders[recipientAddress];
  if (!recipient?.onboarded) {
    throw new ApiError('Recipient must be an onboarded builder.', 404);
  }
  if (
    !community.memberAddresses.some((a) => normalizeAddress(a) === recipientAddress)
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

export async function getBuilder(addressRaw: string): Promise<BuilderProfile | null> {
  const s = await loadOrEmpty();
  const address = normalizeAddress(addressRaw);
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
  const except = exceptAddress ? normalizeAddress(exceptAddress) : undefined;
  const taken = Object.values(s.builders).find(
    (builder) =>
      builder.onboarded &&
      builder.username === username &&
      (!except || normalizeAddress(builder.address) !== except),
  );
  if (taken) {
    return { username, available: false, reason: 'That username is already taken.' };
  }
  return { username, available: true, reason: null };
}

export async function upsertBuilder(input: UpsertBuilderInput): Promise<BuilderProfile> {
  const s = await loadOrEmpty();
  const address = normalizeAddress(input.address);
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

export async function touchBuilder(addressRaw: string): Promise<BuilderProfile | null> {
  const s = await loadOrEmpty();
  const address = normalizeAddress(addressRaw);
  const builder = s.builders[address];
  if (!builder) return null;
  builder.lastSeenAt = new Date().toISOString();
  s.builders[address] = builder;
  await persist(s);
  return builder;
}

export async function setBuilderAvatar(
  addressRaw: string,
  avatarSporeId: string | null,
): Promise<BuilderProfile> {
  const s = await loadOrEmpty();
  const address = normalizeAddress(addressRaw);
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
  addressRaw: string,
  sporeId: string,
): Promise<BuilderProfile | null> {
  const s = await loadOrEmpty();
  const address = normalizeAddress(addressRaw);
  const builder = s.builders[address];
  if (!builder) return null;
  if (builder.avatarSporeId !== sporeId) return builder;
  builder.avatarSporeId = null;
  s.builders[address] = builder;
  await persist(s);
  return builder;
}

export async function releaseBuilderHandle(addressRaw: string): Promise<BuilderProfile | null> {
  const s = await loadOrEmpty();
  const address = normalizeAddress(addressRaw);
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
  addressRaw: string,
  badgeId: string,
): Promise<BuilderProfile> {
  const { KEEPER_BADGES } = await import('@/lib/rewards/milestones');
  const s = await loadOrEmpty();
  const address = normalizeAddress(addressRaw);
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

/** Passport for profile UI — builder + event participation stats. */
export async function getPassport(addressRaw?: string): Promise<{
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
  if (!addressRaw) {
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
  const address = normalizeAddress(addressRaw);
  const builder = await getBuilder(address);
  const stats = passportStatsForAddress(address);
  const badgeLabels: string[] = [];
  if (builder?.onboarded) badgeLabels.push('Joined the relay');
  if (stats.completedRelayIds.length > 0) badgeLabels.push('Relay finisher');
  if (stats.wins > 0) badgeLabels.push('Event winner');
  for (const id of builder?.claimedBadgeIds ?? []) {
    badgeLabels.push(id);
  }

  return {
    address,
    displayName: builder?.displayName ?? 'Keeper',
    characterId: builder?.characterId ?? null,
    relayStreak: Math.min(stats.completedRelayIds.length, 99),
    contributionXp: (builder?.pointsBalance ?? 0) + stats.contributionXp,
    completedRelayIds: stats.completedRelayIds,
    artifactCount: builder?.claimedBadgeIds?.length ?? 0,
    badgeLabels,
    keeperTurns: stats.keeperTurns,
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
