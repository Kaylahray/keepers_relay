import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/** One crown. The JSON holds the bank, including salts. Public reads strip those. */
export const crowns = pgTable('keepers_crowns', {
  id: text('id').primaryKey(),
  payload: jsonb('payload').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Wallet profile. The picture itself is a Spore cell; this row remembers which Spore is the avatar. */
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

/** First choice a wallet makes on one question. A second choice does not get a proof. */
export const crownAttempts = pgTable(
  'keepers_crown_attempts',
  {
    crownId: text('crown_id').notNull(),
    address: text('address').notNull(),
    cursor: integer('cursor').notNull(),
    choice: integer('choice').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.crownId, table.address, table.cursor] })],
);
