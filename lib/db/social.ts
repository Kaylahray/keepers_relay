/**
 * Proper Neon tables for communities + builders + membership.
 * Replaces relying on keepers_app_snapshots JSON for social data.
 */

import { neon } from '@neondatabase/serverless';
import { databaseConfigured, getDb } from './client';
import { builders, communities, communityMembers } from './schema';
import type { BuilderProfile } from '@/types/builder';
import type { Community } from '@/types/community';

let tablesReady = false;

export async function ensureSocialTables(): Promise<void> {
  if (tablesReady || !databaseConfigured()) return;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return;
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
  await sql`
    CREATE TABLE IF NOT EXISTS keepers_communities (
      id text PRIMARY KEY,
      slug text NOT NULL UNIQUE,
      name text NOT NULL,
      blurb text NOT NULL DEFAULT '',
      cover_image_url text NOT NULL DEFAULT '',
      featured boolean NOT NULL DEFAULT false,
      creator_address text NOT NULL,
      creator_name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS keepers_community_members (
      community_id text NOT NULL REFERENCES keepers_communities(id) ON DELETE CASCADE,
      address text NOT NULL,
      role text NOT NULL DEFAULT 'member',
      joined_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (community_id, address)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS keepers_community_members_address_idx
    ON keepers_community_members (address)
  `;

  tablesReady = true;
}

export type SocialState = {
  builders: Record<string, BuilderProfile>;
  communities: Record<string, Community>;
};

function asIso(value: Date | string | null | undefined, fallback?: string): string {
  if (!value) return fallback ?? new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

function rowToBuilder(row: typeof builders.$inferSelect): BuilderProfile {
  return {
    address: row.address,
    username: row.username ?? '',
    displayName: row.displayName,
    characterId: (row.characterId as BuilderProfile['characterId']) ?? null,
    avatarSporeId: row.avatarSporeId ?? null,
    headline: row.headline ?? '',
    joinedAt: asIso(row.joinedAt),
    lastSeenAt: asIso(row.lastSeenAt),
    onboarded: Boolean(row.onboarded),
    pointsBalance: row.pointsBalance ?? 0,
    claimedMilestones: (row.claimedMilestones as BuilderProfile['claimedMilestones']) ?? [],
    claimedBadgeIds: (row.claimedBadgeIds as string[]) ?? [],
    invitedByAddress: row.invitedByAddress ?? null,
    lastRescueAt: row.lastRescueAt ? asIso(row.lastRescueAt) : null,
  };
}

/** Load social SoT from Neon. Returns null if empty / unavailable. */
export async function loadSocialState(): Promise<SocialState | null> {
  if (!databaseConfigured()) return null;
  await ensureSocialTables();
  const db = getDb();

  const [builderRows, communityRows, memberRows] = await Promise.all([
    db.select().from(builders),
    db.select().from(communities),
    db.select().from(communityMembers),
  ]);

  if (communityRows.length === 0 && builderRows.length === 0) return null;

  const buildersMap: Record<string, BuilderProfile> = {};
  for (const row of builderRows) {
    buildersMap[row.address] = rowToBuilder(row);
  }

  const membersByCommunity = new Map<string, string[]>();
  for (const m of memberRows) {
    const list = membersByCommunity.get(m.communityId) ?? [];
    list.push(m.address);
    membersByCommunity.set(m.communityId, list);
  }

  const communitiesMap: Record<string, Community> = {};
  for (const row of communityRows) {
    communitiesMap[row.id] = {
      id: row.id,
      slug: row.slug,
      name: row.name,
      blurb: row.blurb ?? '',
      coverImageUrl: row.coverImageUrl ?? '',
      featured: Boolean(row.featured),
      creatorAddress: row.creatorAddress,
      creatorName: row.creatorName,
      memberAddresses: membersByCommunity.get(row.id) ?? [],
      createdAt: asIso(row.createdAt),
    };
  }

  return { builders: buildersMap, communities: communitiesMap };
}

/** Persist builders + communities + membership rows (proper tables). */
export async function saveSocialState(state: SocialState): Promise<void> {
  if (!databaseConfigured()) return;
  await ensureSocialTables();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return;
  const sql = neon(url);

  for (const b of Object.values(state.builders)) {
    await sql`
      INSERT INTO keepers_builders (
        address, username, display_name, character_id, avatar_spore_id, headline,
        joined_at, last_seen_at, onboarded, points_balance,
        claimed_milestones, claimed_badge_ids, invited_by_address, last_rescue_at
      ) VALUES (
        ${b.address},
        ${b.username ?? ''},
        ${b.displayName},
        ${b.characterId},
        ${b.avatarSporeId},
        ${b.headline ?? ''},
        ${b.joinedAt},
        ${b.lastSeenAt},
        ${b.onboarded},
        ${b.pointsBalance ?? 0},
        ${JSON.stringify(b.claimedMilestones ?? [])}::jsonb,
        ${JSON.stringify(b.claimedBadgeIds ?? [])}::jsonb,
        ${b.invitedByAddress ?? null},
        ${b.lastRescueAt ?? null}
      )
      ON CONFLICT (address) DO UPDATE SET
        username = EXCLUDED.username,
        display_name = EXCLUDED.display_name,
        character_id = EXCLUDED.character_id,
        avatar_spore_id = EXCLUDED.avatar_spore_id,
        headline = EXCLUDED.headline,
        joined_at = EXCLUDED.joined_at,
        last_seen_at = EXCLUDED.last_seen_at,
        onboarded = EXCLUDED.onboarded,
        points_balance = EXCLUDED.points_balance,
        claimed_milestones = EXCLUDED.claimed_milestones,
        claimed_badge_ids = EXCLUDED.claimed_badge_ids,
        invited_by_address = EXCLUDED.invited_by_address,
        last_rescue_at = EXCLUDED.last_rescue_at
    `;
  }

  for (const c of Object.values(state.communities)) {
    await sql`
      INSERT INTO keepers_communities (
        id, slug, name, blurb, cover_image_url, featured,
        creator_address, creator_name, created_at
      ) VALUES (
        ${c.id},
        ${c.slug},
        ${c.name},
        ${c.blurb ?? ''},
        ${c.coverImageUrl ?? ''},
        ${c.featured},
        ${c.creatorAddress},
        ${c.creatorName},
        ${c.createdAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        name = EXCLUDED.name,
        blurb = EXCLUDED.blurb,
        cover_image_url = EXCLUDED.cover_image_url,
        featured = EXCLUDED.featured,
        creator_address = EXCLUDED.creator_address,
        creator_name = EXCLUDED.creator_name,
        created_at = EXCLUDED.created_at
    `;

    const members = c.memberAddresses ?? [];
    /**
     * Never DELETE-all when the in-memory roster is empty — that wiped CKB Main
     * after a bad hydrate. Empty = skip member sync for this community.
     */
    if (members.length === 0) {
      console.warn(
        `[db] skip member sync for ${c.slug}: empty in-memory roster (keeping Neon rows)`,
      );
      continue;
    }

    await sql`DELETE FROM keepers_community_members WHERE community_id = ${c.id}`;

    for (const address of members) {
      const role = address === c.creatorAddress ? 'creator' : 'member';
      await sql`
        INSERT INTO keepers_community_members (community_id, address, role, joined_at)
        VALUES (${c.id}, ${address}, ${role}, now())
        ON CONFLICT (community_id, address) DO UPDATE SET role = EXCLUDED.role
      `;
    }
  }
}

/**
 * One-time: if social tables are empty, copy communities/builders out of the
 * legacy snapshot payload so existing Neon data is not left behind.
 */
export async function migrateSocialFromSnapshotIfNeeded(
  snapshot: Record<string, unknown> | null,
): Promise<boolean> {
  if (!databaseConfigured() || !snapshot) return false;
  await ensureSocialTables();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return false;
  const sql = neon(url);

  const existing = await sql`SELECT COUNT(*)::int AS n FROM keepers_communities`;
  if ((existing[0]?.n ?? 0) > 0) return false;

  const buildersMap = (snapshot.builders ?? {}) as Record<string, BuilderProfile>;
  const communitiesMap = (snapshot.communities ?? {}) as Record<string, Community>;
  if (Object.keys(communitiesMap).length === 0 && Object.keys(buildersMap).length === 0) {
    return false;
  }

  await saveSocialState({ builders: buildersMap, communities: communitiesMap });
  console.info(
    `[db] migrated ${Object.keys(communitiesMap).length} communities + ${Object.keys(buildersMap).length} builders into proper tables`,
  );
  return true;
}

/**
 * If a community row exists but has zero members, refill from snapshot, else seed.
 * Fixes the wipe caused by empty in-memory rosters flushing to Neon.
 */
export async function repairEmptyMembershipsFromSnapshot(
  snapshot: Record<string, unknown> | null,
): Promise<number> {
  if (!databaseConfigured()) return 0;
  await ensureSocialTables();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return 0;
  const sql = neon(url);

  const SEED: Record<string, string[]> = {
    comm_ckb_main: [
      'ckt1qdemo...keeper',
      'ckt1qzdemo_ember_builder_02',
      'ckt1qzdemo_volt_builder_03',
      'ckt1qzdemo_mira_builder_04',
      'ckt1qzdemo_spark_builder_05',
    ],
    comm_fun_facts: [
      'ckt1qdemo...keeper',
      'ckt1qzdemo_ember_builder_02',
      'ckt1qzdemo_volt_builder_03',
    ],
    comm_study: [
      'ckt1qzdemo_ember_builder_02',
      'ckt1qzdemo_volt_builder_03',
      'ckt1qzdemo_mira_builder_04',
      'ckt1qzdemo_spark_builder_05',
    ],
    comm_memes: ['ckt1qdemo...keeper', 'ckt1qzdemo_volt_builder_03'],
  };

  const snapCommunities = (snapshot?.communities ?? {}) as Record<string, Community>;
  const rows = await sql`SELECT id, slug, creator_address FROM keepers_communities`;
  let repaired = 0;

  for (const row of rows) {
    const count = await sql`
      SELECT COUNT(*)::int AS n FROM keepers_community_members WHERE community_id = ${row.id}
    `;
    if ((count[0]?.n ?? 0) > 0) continue;

    const fromSnap = snapCommunities[row.id]?.memberAddresses ?? [];
    const members = fromSnap.length > 0 ? fromSnap : (SEED[row.id] ?? []);
    if (members.length === 0) continue;

    const creator = row.creator_address ?? snapCommunities[row.id]?.creatorAddress ?? '';
    for (const address of members) {
      const role = address === creator ? 'creator' : 'member';
      await sql`
        INSERT INTO keepers_community_members (community_id, address, role, joined_at)
        VALUES (${row.id}, ${address}, ${role}, now())
        ON CONFLICT (community_id, address) DO NOTHING
      `;
    }
    repaired += 1;
    console.info(`[db] repaired members for ${row.slug}: ${members.length}`);
  }

  return repaired;
}
