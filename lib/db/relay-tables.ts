/**
 * Ensure Event Engine Neon tables exist (idempotent CREATE IF NOT EXISTS).
 * Called lazily when DATABASE_URL is set — same pattern as app snapshots.
 */

import { neon } from '@neondatabase/serverless';
import { databaseConfigured } from './client';

let ready = false;

export async function ensureRelayEventTables(): Promise<void> {
  if (ready || !databaseConfigured()) return;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return;
  const sql = neon(url);

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

  ready = true;
}
