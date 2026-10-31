import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import { databaseConfigured, getDb } from '@/lib/db/client';
import { builders } from '@/lib/db/schema';
import { ApiError } from '@/lib/server/errors';
import { normalizeAddress } from '@/lib/server/auth';
import { chainUsernameOf, chainUsernames } from '@/lib/server/username-registry';
import type { BuilderProfile } from '@/types/builder';
import type { CharacterId } from '@/lib/characters';
import type { RewardMilestone } from '@/lib/rewards/milestones';

let ready = false;

async function ensureBuilders(): Promise<void> {
  if (ready || !databaseConfigured()) return;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new ApiError('DATABASE_URL is required for profiles.', 503);
  const sql = neon(url);
  await sql`
    CREATE TABLE IF NOT EXISTS keepers_builders (
      address text PRIMARY KEY,
      username text NOT NULL DEFAULT '',
      display_name text NOT NULL,
      character_id text,
      avatar_spore_id text,
      headline text NOT NULL DEFAULT '',
      joined_at timestamptz NOT NULL,
      last_seen_at timestamptz NOT NULL,
      onboarded boolean NOT NULL DEFAULT false,
      points_balance integer NOT NULL DEFAULT 0,
      claimed_milestones jsonb NOT NULL DEFAULT '[]'::jsonb,
      claimed_badge_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      invited_by_address text,
      last_rescue_at timestamptz
    )
  `;
  ready = true;
}

function asMilestones(value: unknown): RewardMilestone[] {
  return Array.isArray(value) ? (value as RewardMilestone[]) : [];
}

function asBadges(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function toProfile(row: typeof builders.$inferSelect): BuilderProfile {
  return {
    address: row.address,
    username: row.username,
    displayName: row.displayName,
    characterId: (row.characterId as CharacterId | null) ?? null,
    avatarSporeId: row.avatarSporeId,
    headline: row.headline,
    joinedAt: row.joinedAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    onboarded: row.onboarded,
    pointsBalance: row.pointsBalance,
    claimedMilestones: asMilestones(row.claimedMilestones),
    claimedBadgeIds: asBadges(row.claimedBadgeIds),
    invitedByAddress: row.invitedByAddress,
    lastRescueAt: row.lastRescueAt ? row.lastRescueAt.toISOString() : null,
  };
}

/**
 * Everyone who has claimed a username. Names come from the username cells on chain; the table adds
 * pictures and bios. A name claimed on chain that the table never heard of is saved to it here, so
 * the list and the seat check agree with the chain. If the chain cannot be read, the table alone is
 * used.
 */
export async function listBuilderProfiles(): Promise<BuilderProfile[]> {
  if (!databaseConfigured()) return [];
  await ensureBuilders();
  const names = await chainUsernames().catch((error) => {
    console.warn('[players] could not read usernames from chain:', error);
    return null;
  });
  let rows = (await getDb().select().from(builders)).map(toProfile);
  if (!names) return rows;
  const byAddress = new Map(rows.map((row) => [row.address, row]));
  let changed = false;
  for (const [address, username] of names) {
    const row = byAddress.get(address);
    if (row?.username === username) continue;
    await upsertBuilder({ address, username, displayName: row?.displayName || username });
    changed = true;
  }
  if (changed) rows = (await getDb().select().from(builders)).map(toProfile);
  // A name released on chain is no longer a name, whatever the table still says.
  return rows.filter((row) => names.get(row.address) === row.username);
}

export async function getBuilder(address: string): Promise<BuilderProfile | null> {
  if (!databaseConfigured()) return null;
  await ensureBuilders();
  const rows = await getDb().select().from(builders).where(eq(builders.address, normalizeAddress(address))).limit(1);
  return rows[0] ? toProfile(rows[0]) : null;
}

export async function upsertBuilder(input: {
  address: string;
  username: string;
  displayName: string;
  characterId?: CharacterId | null;
  headline?: string;
  avatarSporeId?: string | null;
}): Promise<BuilderProfile> {
  await ensureBuilders();
  const address = normalizeAddress(input.address);
  const now = new Date();
  const existing = await getBuilder(address);
  const db = getDb();
  if (!existing) {
    await db.insert(builders).values({
      address,
      username: input.username ?? '',
      displayName: input.displayName || 'Player',
      characterId: input.characterId ?? null,
      avatarSporeId: input.avatarSporeId ?? null,
      headline: input.headline ?? '',
      joinedAt: now,
      lastSeenAt: now,
      onboarded: Boolean(input.username),
      pointsBalance: 0,
      claimedMilestones: [],
      claimedBadgeIds: [],
    });
  } else {
    await db
      .update(builders)
      .set({
        username: input.username ?? existing.username,
        displayName: input.displayName || existing.displayName,
        characterId: input.characterId === undefined ? existing.characterId : input.characterId,
        avatarSporeId: input.avatarSporeId === undefined ? existing.avatarSporeId : input.avatarSporeId,
        headline: input.headline ?? existing.headline,
        lastSeenAt: now,
        onboarded: existing.onboarded || Boolean(input.username),
      })
      .where(eq(builders.address, address));
  }
  const saved = await getBuilder(address);
  if (!saved) throw new ApiError('The profile could not be saved.', 500);
  return saved;
}

/**
 * The name a player goes by in lobbies. Every player claims a username before taking a seat or
 * hosting, so a wallet without one is refused here. The name comes from the profile, never from
 * what the browser sends.
 */
export async function requirePlayerName(address: string): Promise<string> {
  if (!databaseConfigured()) return `${address.slice(0, 10)}…`;
  const player = await getBuilder(address);
  if (player?.username) return player.displayName || player.username;
  // Claimed on chain but never saved here: save it now rather than turn the player away.
  const onChain = await chainUsernameOf(address).catch(() => null);
  if (!onChain) throw new ApiError('Claim a username to play.', 403);
  const saved = await upsertBuilder({ address, username: onChain, displayName: player?.displayName || onChain });
  return saved.displayName || saved.username;
}

export async function setBuilderAvatar(address: string, avatarSporeId: string | null): Promise<BuilderProfile> {
  const existing = await getBuilder(address);
  if (!existing) {
    return upsertBuilder({
      address,
      username: '',
      displayName: 'Player',
      avatarSporeId,
    });
  }
  await getDb()
    .update(builders)
    .set({ avatarSporeId, lastSeenAt: new Date() })
    .where(eq(builders.address, normalizeAddress(address)));
  const saved = await getBuilder(address);
  if (!saved) throw new ApiError('The picture could not be saved.', 500);
  return saved;
}

/** The player gave their username back on chain: clear it here, so it no longer takes seats or shows. */
export async function releaseBuilderName(address: string): Promise<BuilderProfile | null> {
  if (!databaseConfigured()) return null;
  await ensureBuilders();
  await getDb()
    .update(builders)
    .set({ username: '', onboarded: false, lastSeenAt: new Date() })
    .where(eq(builders.address, normalizeAddress(address)));
  return getBuilder(address);
}
