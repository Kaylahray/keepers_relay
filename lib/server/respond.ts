import { NextResponse } from 'next/server';
import {
  StoreError,
  applyIndexedCells,
  exportStoreState,
  importStoreState,
  type StoreState,
} from './store';
import { loadSnapshot, saveSnapshot, persistenceMode } from '@/lib/db/persist';

let lastHydrateAt = 0;
const HYDRATE_TTL_MS = 1_500;
let lastIndexAt = 0;
const INDEX_TTL_MS = 8_000;

async function ensureHydrated(): Promise<void> {
  const fresh =
    Boolean((globalThis as { __keepersRelayStoreV7?: unknown }).__keepersRelayStoreV7) &&
    Date.now() - lastHydrateAt < HYDRATE_TTL_MS;
  if (fresh) return;

  const snap = await loadSnapshot();
  if (snap && typeof snap === 'object' && 'journeys' in snap && 'communities' in snap) {
    importStoreState(snap as unknown as StoreState);
  }
  lastHydrateAt = Date.now();
}

/** Lazy-load so a bad indexer import cannot 500 builders / communities. */
async function syncFromIndexer(): Promise<void> {
  if (Date.now() - lastIndexAt < INDEX_TTL_MS) return;
  lastIndexAt = Date.now();
  try {
    const { loadLiveChainCells } = await import('@/lib/ckb/chain-indexer');
    const live = await loadLiveChainCells();
    if (applyIndexedCells(live)) {
      await flush();
    }
  } catch (err) {
    console.warn('[indexer] live cell sync failed:', err);
  }
}

async function flush(): Promise<void> {
  try {
    await saveSnapshot(exportStoreState() as unknown as Record<string, unknown>);
    lastHydrateAt = Date.now();
  } catch (err) {
    console.warn(`[persist:${persistenceMode()}] save failed:`, err);
  }
}

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof StoreError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return NextResponse.json({ message }, { status: 500 });
}

/** Read path — hydrates from Neon / local file, does not write. */
export async function respond<T>(run: () => T): Promise<NextResponse> {
  try {
    await ensureHydrated();
    await syncFromIndexer();
    return NextResponse.json(run());
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Write path — hydrates, runs mutation, then persists so other users share state. */
export async function respondWrite<T>(run: () => T): Promise<NextResponse> {
  try {
    await ensureHydrated();
    await syncFromIndexer();
    const data = run();
    await flush();
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
