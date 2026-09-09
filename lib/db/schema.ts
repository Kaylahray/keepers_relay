import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/** Single-row JSON snapshot of the Keepers app store (legacy / journeys). */
export const appSnapshots = pgTable('keepers_app_snapshots', {
  id: text('id').primaryKey().default('main'),
  payload: text('payload').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Wallet profiles — source of truth for builders / members. */
export const builders = pgTable('keepers_builders', {
  address: text('address').primaryKey(),
  username: text('username').notNull().default(''),
  displayName: text('display_name').notNull(),
  characterId: text('character_id'),
  avatarSporeId: text('avatar_spore_id'),
  headline: text('headline').notNull().default(''),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  onboarded: boolean('onboarded').notNull().default(false),
  pointsBalance: integer('points_balance').notNull().default(0),
  claimedMilestones: jsonb('claimed_milestones').notNull().default([]),
  claimedBadgeIds: jsonb('claimed_badge_ids').notNull().default([]),
  invitedByAddress: text('invited_by_address'),
  lastRescueAt: timestamp('last_rescue_at', { withTimezone: true }),
});

/** Persistent groups (Community = room). Events attach optionally. */
export const communities = pgTable('keepers_communities', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  blurb: text('blurb').notNull().default(''),
  coverImageUrl: text('cover_image_url').notNull().default(''),
  featured: boolean('featured').notNull().default(false),
  creatorAddress: text('creator_address').notNull(),
  creatorName: text('creator_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const communityMembers = pgTable(
  'keepers_community_members',
  {
    communityId: text('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    address: text('address').notNull(),
    role: text('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.communityId, t.address] })],
);

/**
 * Event Engine tables — Neon metadata + question vault.
 * On-chain truth = Event / Player / Turn cells; Neon is UX + commit-reveal store.
 * Extractable later with `@relay-ckb/indexer` consumers.
 */

export const relayEvents = pgTable('relay_events', {
  id: text('id').primaryKey(),
  hostAddress: text('host_address').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  mode: text('mode').notNull(),
  status: text('status').notNull(),
  /** Whole-event JSON blob during migration; columns win for queries. */
  payload: jsonb('payload').notNull(),
  /** CKB event cell type-id when minted. */
  eventCellId: text('event_cell_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const relayPlayers = pgTable('relay_players', {
  id: text('id').primaryKey(),
  eventId: text('event_id')
    .notNull()
    .references(() => relayEvents.id, { onDelete: 'cascade' }),
  address: text('address').notNull(),
  displayName: text('display_name').notNull(),
  status: text('status').notNull(),
  stakeCkb: integer('stake_ckb').notNull().default(0),
  score: integer('score').notNull().default(0),
  playerCellId: text('player_cell_id'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
});

export const relayTurns = pgTable('relay_turns', {
  id: text('id').primaryKey(),
  eventId: text('event_id')
    .notNull()
    .references(() => relayEvents.id, { onDelete: 'cascade' }),
  round: integer('round').notNull(),
  state: text('state').notNull(),
  holderAddress: text('holder_address').notNull(),
  questionCommit: text('question_commit').notNull(),
  turnCellId: text('turn_cell_id'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  deadlineAt: timestamp('deadline_at', { withTimezone: true }).notNull(),
  payload: jsonb('payload'),
});

/** Commit-reveal vault — correctIndex never shipped to clients. */
export const relayQuestions = pgTable('relay_questions', {
  id: text('id').primaryKey(),
  eventId: text('event_id')
    .notNull()
    .references(() => relayEvents.id, { onDelete: 'cascade' }),
  commit: text('commit').notNull(),
  prompt: text('prompt').notNull(),
  options: jsonb('options').notNull(),
  correctIndex: integer('correct_index').notNull(),
  category: text('category').notNull().default('general'),
  difficulty: text('difficulty').notNull().default('medium'),
  explanation: text('explanation'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const relayDomainEvents = pgTable('relay_domain_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  eventId: text('event_id'),
  actorAddress: text('actor_address'),
  payload: jsonb('payload'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});
