import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getServerCkbClient } from '@/lib/ckb/server-client';
import { loadRally, type RallyRunner } from '@/lib/rally/rules';
import { readRallyStats, type RallyStats } from '@/lib/rally/stats';
import { respond } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

/** How long one read of the chain serves everyone. */
const FRESH_MS = 20_000;

let cached: RallyStats | null = null;
let reading: Promise<RallyStats> | null = null;
let rules: Promise<RallyRunner> | null = null;

/** The rally rules, to replay each race for its shards. */
function rally(): Promise<RallyRunner> {
  rules ??= loadRally(readFileSync(path.join(process.cwd(), 'public/games/rally.wasm')));
  return rules;
}

/** Public: every finished Crown Rally race on chain, and each wallet's matches played, wins, CKB won and shards. */
export function GET() {
  return respond(async () => {
    if (cached && Date.now() - cached.readAt < FRESH_MS) return cached;
    reading ??= rally()
      .then((runner) => readRallyStats(getServerCkbClient(), runner))
      .then((stats) => (cached = stats))
      .finally(() => (reading = null));
    return reading;
  });
}
