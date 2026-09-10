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

/** Fetch one event by id — used when the working set miss happens after a race or cold instance. */
export async function loadRelayEventById(eventId: string): Promise<RelayEvent | null> {
  if (!databaseConfigured() || !eventId) return null;
  await ensureRelayEventTables();
  const sql = neon(requireDatabaseUrl());
  try {
    const rows = await sql`
      SELECT payload FROM relay_events WHERE id = ${eventId} LIMIT 1
    `;
    const raw = rows[0]?.payload;
    if (!raw) return null;
    const event =
      typeof raw === 'string' ? (JSON.parse(raw) as RelayEvent) : (raw as RelayEvent);
    return event?.id ? event : null;
  } catch (err) {
    console.warn('[db] loadRelayEventById failed:', err);
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

/**
 * Best-effort write of question vault rows (includes correct_index).
 * Never throws to callers — create/list must not break if this fails.
 */
export async function persistRelayQuestionsBestEffort(event: RelayEvent): Promise<void> {
  if (!databaseConfigured() || !event?.id || !event.questionPool?.length) return;
  try {
    await ensureRelayEventTables();
    const sql = neon(requireDatabaseUrl());
    for (const q of event.questionPool) {
      await sql`
        INSERT INTO relay_questions (
          id, event_id, commit, prompt, options, correct_index,
          category, difficulty, explanation, created_at
        ) VALUES (
          ${q.id},
          ${event.id},
          ${q.commit},
          ${q.prompt},
          ${JSON.stringify(q.options ?? [])}::jsonb,
          ${q.correctIndex ?? 0},
          ${q.category ?? 'general'},
          ${q.difficulty ?? 'medium'},
          ${q.explanation ?? null},
          now()
        )
        ON CONFLICT (id) DO UPDATE SET
          commit = EXCLUDED.commit,
          prompt = EXCLUDED.prompt,
          options = EXCLUDED.options,
          correct_index = EXCLUDED.correct_index,
          category = EXCLUDED.category,
          difficulty = EXCLUDED.difficulty,
          explanation = EXCLUDED.explanation
      `;
    }
  } catch (err) {
    console.warn('[db] persistRelayQuestionsBestEffort failed:', err);
  }
}
