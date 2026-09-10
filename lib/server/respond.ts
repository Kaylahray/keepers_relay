import { NextResponse } from 'next/server';
import { loadSnapshot, persistenceMode } from '@/lib/db/persist';
import {
  ensureSocialTables,
  migrateSocialFromSnapshotIfNeeded,
  repairEmptyMembershipsFromSnapshot,
} from '@/lib/db/social';
import { ensureRelayEventTables } from '@/lib/db/relay-tables';
import { loadAllRelayEvents, saveAllRelayEvents } from '@/lib/db/events-persist';
import { databaseConfigured } from '@/lib/db/client';
import {
  consumeEventsDirty,
  ensureDemoEvents,
  exportRelayEvents,
  importRelayEvents,
} from '@/lib/server/events-store';
import { ApiError } from '@/lib/server/errors';

/**
 * Always reload events from Neon when DATABASE_URL is set.
 * No warm in-memory skip — that caused cross-instance 404s on Vercel.
 */
async function hydrateEvents(): Promise<void> {
  if (!databaseConfigured()) {
    importRelayEvents([]);
    return;
  }

  await ensureRelayEventTables();
  const rows = await loadAllRelayEvents();
  if (rows.length > 0) {
    importRelayEvents(rows);
    return;
  }

  ensureDemoEvents();
  const seeded = exportRelayEvents();
  if (seeded.length > 0) {
    await saveAllRelayEvents(seeded);
    consumeEventsDirty();
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
  }

  await hydrateEvents();
}

async function flushEvents(): Promise<void> {
  try {
    await saveAllRelayEvents(exportRelayEvents());
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
  return NextResponse.json({ message }, { status: 500 });
}

/** Read path — hydrates from Neon, persists event mutations (e.g. auto-start). */
export async function respond<T>(run: () => T | Promise<T>): Promise<NextResponse> {
  try {
    await ensureHydrated();
    const data = await run();
    if (consumeEventsDirty()) {
      await flushEvents();
    }
    return NextResponse.json(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Write path — hydrates, runs mutation, then persists events. */
export async function respondWrite<T>(run: () => T | Promise<T>): Promise<NextResponse> {
  try {
    await ensureHydrated();
    const data = await run();
    await flushEvents();
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
