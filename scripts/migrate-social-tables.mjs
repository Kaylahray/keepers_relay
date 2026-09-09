/**
 * One-shot: create social tables + migrate snapshot → rows.
 * Usage: node scripts/migrate-social-tables.mjs
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { neon } from '@neondatabase/serverless';

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();
const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}
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

// Also create empty event-engine tables (defined in schema, unused until wired)
await sql`
  CREATE TABLE IF NOT EXISTS relay_events (
    id text PRIMARY KEY,
    host_address text NOT NULL,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    mode text NOT NULL,
    status text NOT NULL,
    payload jsonb NOT NULL,
    event_cell_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;
await sql`
  CREATE TABLE IF NOT EXISTS relay_players (
    id text PRIMARY KEY,
    event_id text NOT NULL REFERENCES relay_events(id) ON DELETE CASCADE,
    address text NOT NULL,
    display_name text NOT NULL,
    status text NOT NULL,
    stake_ckb integer NOT NULL DEFAULT 0,
    score integer NOT NULL DEFAULT 0,
    player_cell_id text,
    joined_at timestamptz NOT NULL DEFAULT now()
  )
`;
await sql`
  CREATE TABLE IF NOT EXISTS relay_turns (
    id text PRIMARY KEY,
    event_id text NOT NULL REFERENCES relay_events(id) ON DELETE CASCADE,
    round integer NOT NULL,
    state text NOT NULL,
    holder_address text NOT NULL,
    question_commit text NOT NULL,
    turn_cell_id text,
    started_at timestamptz NOT NULL,
    deadline_at timestamptz NOT NULL,
    payload jsonb
  )
`;
await sql`
  CREATE TABLE IF NOT EXISTS relay_questions (
    id text PRIMARY KEY,
    event_id text NOT NULL REFERENCES relay_events(id) ON DELETE CASCADE,
    commit text NOT NULL,
    prompt text NOT NULL,
    options jsonb NOT NULL,
    correct_index integer NOT NULL,
    category text NOT NULL DEFAULT 'general',
    difficulty text NOT NULL DEFAULT 'medium',
    explanation text,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`;
await sql`
  CREATE TABLE IF NOT EXISTS relay_domain_events (
    id text PRIMARY KEY,
    type text NOT NULL,
    event_id text,
    actor_address text,
    payload jsonb,
    at timestamptz NOT NULL DEFAULT now()
  )
`;

const existing = await sql`SELECT COUNT(*)::int AS n FROM keepers_communities`;
let migrated = false;

if ((existing[0]?.n ?? 0) === 0) {
  const snapRows = await sql`SELECT payload FROM keepers_app_snapshots WHERE id = 'main' LIMIT 1`;
  if (snapRows[0]?.payload) {
    const payload = JSON.parse(snapRows[0].payload);
    const builders = payload.builders ?? {};
    const communities = payload.communities ?? {};

    for (const b of Object.values(builders)) {
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
        ON CONFLICT (address) DO NOTHING
      `;
    }

    for (const c of Object.values(communities)) {
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
        ON CONFLICT (id) DO NOTHING
      `;
      for (const address of c.memberAddresses ?? []) {
        const role = address === c.creatorAddress ? 'creator' : 'member';
        await sql`
          INSERT INTO keepers_community_members (community_id, address, role)
          VALUES (${c.id}, ${address}, ${role})
          ON CONFLICT (community_id, address) DO NOTHING
        `;
      }
    }
    migrated = true;
  }
}

const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' ORDER BY table_name
`;
console.log('\n=== TABLES NOW ===');
console.log(tables.map((t) => t.table_name).join('\n'));
console.log('\nmigrated from snapshot:', migrated);

for (const name of [
  'keepers_app_snapshots',
  'keepers_builders',
  'keepers_communities',
  'keepers_community_members',
  'relay_events',
  'relay_players',
  'relay_turns',
  'relay_questions',
  'relay_domain_events',
]) {
  const rows = await sql.query(`SELECT COUNT(*)::int AS n FROM ${name}`);
  console.log(`${name}: ${rows[0].n} rows`);
}

console.log('\n=== keepers_builders ===');
console.log(await sql`SELECT address, username, display_name, onboarded, points_balance FROM keepers_builders`);

console.log('\n=== keepers_communities ===');
console.log(await sql`SELECT id, slug, name, creator_name, featured FROM keepers_communities`);

console.log('\n=== keepers_community_members ===');
console.log(await sql`SELECT community_id, address, role FROM keepers_community_members ORDER BY community_id, address`);
