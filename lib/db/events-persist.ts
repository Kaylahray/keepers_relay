/**
 * Persist Event Engine RelayEvent blobs to Neon `relay_events.payload`.
 * Neon is the only shared source of truth — no local file fallback for events.
 */

import { neon } from '@neondatabase/serverless';
import { databaseConfigured } from './client';
import { ensureRelayEventTables } from './relay-tables';
import type { RelayEvent } from '@/types/event';

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'DATABASE_URL is required for events. Set the Neon connection string on Vercel / .env.local.',
    );
  }
  return url;
}

export async function loadAllRelayEvents(): Promise<RelayEvent[]> {
  if (!databaseConfigured()) return [];
  await ensureRelayEventTables();
  const sql = neon(requireDatabaseUrl());
  try {
    const rows = await sql`SELECT payload FROM relay_events ORDER BY updated_at DESC`;
    const out: RelayEvent[] = [];
    for (const row of rows) {
      const raw = row.payload;
      if (!raw) continue;
      const event =
        typeof raw === 'string' ? (JSON.parse(raw) as RelayEvent) : (raw as RelayEvent);
      if (event?.id) out.push(event);
    }
    return out;
  } catch (err) {
    console.warn('[db] loadAllRelayEvents failed:', err);
    throw err;
  }
}

export async function upsertRelayEvent(event: RelayEvent): Promise<void> {
  if (!databaseConfigured()) {
    throw new Error(
      'DATABASE_URL is required to save events. Set the Neon connection string on Vercel / .env.local.',
    );
  }
  await ensureRelayEventTables();
  const sql = neon(requireDatabaseUrl());
  const updatedAt = new Date().toISOString();
  const payload = JSON.stringify(event);
  await sql`
    INSERT INTO relay_events (
      id, host_address, name, description, mode, status, payload, event_cell_id, created_at, updated_at
    ) VALUES (
      ${event.id},
      ${event.hostAddress},
      ${event.name},
      ${event.description ?? ''},
      ${event.mode},
      ${event.status},
      ${payload}::jsonb,
      ${event.eventCellId ?? null},
      ${event.createdAt},
      ${updatedAt}
    )
    ON CONFLICT (id) DO UPDATE SET
      host_address = EXCLUDED.host_address,
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      mode = EXCLUDED.mode,
      status = EXCLUDED.status,
      payload = EXCLUDED.payload,
      event_cell_id = EXCLUDED.event_cell_id,
      updated_at = EXCLUDED.updated_at
  `;
}

export async function saveAllRelayEvents(events: RelayEvent[]): Promise<void> {
  if (!databaseConfigured()) {
    if (events.length > 0) {
      throw new Error(
        'DATABASE_URL is required to save events. Set the Neon connection string on Vercel / .env.local.',
      );
    }
    return;
  }
  for (const event of events) {
    await upsertRelayEvent(event);
  }
}
