/**
 * Event indexer stub — lists live Event cells once scripts deploy.
 * Turn state is embedded on the Event Cell (no separate Turn Cell).
 * Phase 1 uses `lib/server/events-store.ts` as SoT.
 */

export type IndexedEventSummary = {
  eventId: string;
  status: number;
  mode: number;
  potAmount: string;
  playerCount: number;
  startTimeMs: string;
};

/**
 * Query live events from the chain indexer.
 * Throws until Event Cell scripts are configured.
 */
export async function listLiveEventsFromChain(): Promise<IndexedEventSummary[]> {
  throw new Error(
    'Event indexer not live — use /api/events mock store until Event Cell scripts deploy.',
  );
}
