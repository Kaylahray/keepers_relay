import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Single-row JSON snapshot of the Keepers app store (multi-user durable stop). */
export const appSnapshots = pgTable('keepers_app_snapshots', {
  id: text('id').primaryKey().default('main'),
  payload: text('payload').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
