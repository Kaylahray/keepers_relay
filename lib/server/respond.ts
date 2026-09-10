import { NextResponse } from 'next/server';
import { loadSnapshot, persistenceMode } from '@/lib/db/persist';
import {
  ensureSocialTables,
  migrateSocialFromSnapshotIfNeeded,
  repairEmptyMembershipsFromSnapshot,
} from '@/lib/db/social';
import { ensureRelayEventTables } from '@/lib/db/relay-tables';
import {
  loadAllRelayEvents,
  loadRelayEventById,
  saveAllRelayEvents,
  upsertRelayEvent,
} from '@/lib/db/events-persist';
import { databaseConfigured } from '@/lib/db/client';
import {
  consumeDirtyEventIds,
  consumeEventsDirty,
  ensureDemoEvents,
  exportRelayEvents,
  importRelayEvents,
  putRelayEvent,
  runAutoStarts,
} from '@/lib/server/events-store';
import { refreshCommunityIndex } from '@/lib/server/social-service';
import { ApiError } from '@/lib/server/errors';
import type { RelayEvent } from '@/types/event';
import { persistRelayQuestionsBestEffort } from '@/lib/db/events-persist';

/**
 * Serialize hydrate → handler → flush on this isolate.
 */
let eventsGate: Promise<void> = Promise.resolve();

function withEventsGate<T>(fn: () => Promise<T>): Promise<T> {
  const run = eventsGate.then(fn, fn);
  eventsGate = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function allowDemoSeed(): boolean {
  if (process.env.ALLOW_DEMO_SEED === '1') return true;
  return process.env.NODE_ENV !== 'production';
}

async function hydrateEvents(): Promise<void> {
  if (!databaseConfigured()) {
    if (allowDemoSeed()) ensureDemoEvents();
    return;
  }

  await ensureRelayEventTables();
  const rows = await loadAllRelayEvents();
  if (rows.length > 0) {
    importRelayEvents(rows);
    return;
  }

  if (!allowDemoSeed()) return;

  ensureDemoEvents();
  const seeded = exportRelayEvents();
  if (seeded.length > 0) {
    await saveAllRelayEvents(seeded);
    consumeEventsDirty();
    consumeDirtyEventIds();
  }
}

async function ensureHydrated(): Promise<void> {
  if (databaseConfigured()) {
    await ensureSocialTables();
    await ensureRelayEventTables();
    const snap = await loadSnapshot();
    if (snap && typeof snap === 'object') {
      await migrateSocialFromSnapshotIfNeeded(snap as Record<string, unknown>);
      await repairEmptyMembershipsFromSnapshot(snap as Record<string, unknown>);
    } else {
      await repairEmptyMembershipsFromSnapshot(null);
    }
    await refreshCommunityIndex();
  }

  await hydrateEvents();
}

async function flushDirtyEvents(): Promise<void> {
  if (!databaseConfigured()) return;
  const dirty = consumeDirtyEventIds();
  const all = exportRelayEvents();
  try {
    if (dirty === 'all') {
      await saveAllRelayEvents(all);
    } else if (dirty.length > 0) {
      const map = new Map(all.map((e) => [e.id, e]));
      for (const id of dirty) {
        const event = map.get(id);
        if (event) await upsertRelayEvent(event);
      }
    }
    consumeEventsDirty();
  } catch (err) {
    console.warn(`[persist:${persistenceMode()}] event save failed:`, err);
    throw err;
  }
}

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  // Domain throws historically used bare Error — map common cases to 400.
  const lower = message.toLowerCase();
  if (
    lower.includes('already') ||
    lower.includes('only the host') ||
    lower.includes('not open') ||
    lower.includes('connect') ||
    lower.includes('missing') ||
    lower.includes('no active') ||
    lower.includes('not your turn') ||
    lower.includes('required')
  ) {
    return NextResponse.json({ message }, { status: 400 });
  }
  return NextResponse.json({ message }, { status: 500 });
}

export async function ensureEventLoaded(eventId: string): Promise<boolean> {
  if (!eventId || !databaseConfigured()) return false;
  const row = await loadRelayEventById(eventId);
  if (!row) return false;
  putRelayEvent(row);
  return true;
}

export async function persistEventNow(event: RelayEvent): Promise<void> {
  if (!databaseConfigured()) return;
  await upsertRelayEvent(event);
}

/** Read path — hydrates events; no auto-start (F13). */
export async function respond<T>(run: () => T | Promise<T>): Promise<NextResponse> {
  return withEventsGate(async () => {
    try {
      await ensureHydrated();
      const data = await run();
      if (consumeEventsDirty()) {
        await flushDirtyEvents();
      } else {
        consumeDirtyEventIds();
      }
      return NextResponse.json(data);
    } catch (error) {
      return toErrorResponse(error);
    }
  });
}

/** Event write path — hydrate, auto-start tick, mutate, upsert dirty event rows only. */
export async function respondWrite<T>(run: () => T | Promise<T>): Promise<NextResponse> {
  return withEventsGate(async () => {
    try {
      await ensureHydrated();
      runAutoStarts();
      const data = await run();
      if (
        data &&
        typeof data === 'object' &&
        'id' in data &&
        'questionPool' in data &&
        'players' in data &&
        'hostAddress' in data
      ) {
        const event = data as unknown as RelayEvent;
        await persistEventNow(event);
        await persistRelayQuestionsBestEffort(event);
      }
      await flushDirtyEvents();
      return NextResponse.json(data);
    } catch (error) {
      return toErrorResponse(error);
    }
  });
}

/** Social / non-event writes — no event Map flush. */
export async function respondSocial<T>(run: () => T | Promise<T>): Promise<NextResponse> {
  try {
    if (databaseConfigured()) {
      await ensureSocialTables();
    }
    const data = await run();
    return NextResponse.json(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function readBody<T>(request: Request): Promise<Partial<T>> {
  try {
    return (await request.json()) as Partial<T>;
  } catch {
    return {};
  }
}
