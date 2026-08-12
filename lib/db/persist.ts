import { eq } from 'drizzle-orm';
import { neon } from '@neondatabase/serverless';
import { promises as fs } from 'fs';
import path from 'path';
import { databaseConfigured, getDb } from './client';
import { appSnapshots } from './schema';

const SNAPSHOT_ID = 'main';
const LOCAL_FILE = path.join(process.cwd(), '.data', 'keepers-store.json');

export type PersistableStore = Record<string, unknown>;

let tableReady = false;

async function ensureNeonTable(): Promise<void> {
  if (tableReady) return;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return;
  const sql = neon(url);
  await sql`
    CREATE TABLE IF NOT EXISTS keepers_app_snapshots (
      id text PRIMARY KEY,
      payload text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  tableReady = true;
}

/** Load the durable snapshot, if any. */
export async function loadSnapshot(): Promise<PersistableStore | null> {
  if (databaseConfigured()) {
    try {
      await ensureNeonTable();
      const db = getDb();
      const rows = await db
        .select()
        .from(appSnapshots)
        .where(eq(appSnapshots.id, SNAPSHOT_ID))
        .limit(1);
      const row = rows[0];
      if (!row?.payload) return null;
      return JSON.parse(row.payload) as PersistableStore;
    } catch (err) {
      console.warn('[db] loadSnapshot failed:', err);
      return null;
    }
  }

  try {
    const raw = await fs.readFile(LOCAL_FILE, 'utf8');
    return JSON.parse(raw) as PersistableStore;
  } catch {
    return null;
  }
}

/** Save the store snapshot (Neon when DATABASE_URL is set, else local .data file). */
export async function saveSnapshot(payload: PersistableStore): Promise<void> {
  const body = JSON.stringify(payload);

  if (databaseConfigured()) {
    await ensureNeonTable();
    const db = getDb();
    await db
      .insert(appSnapshots)
      .values({
        id: SNAPSHOT_ID,
        payload: body,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appSnapshots.id,
        set: { payload: body, updatedAt: new Date() },
      });
    return;
  }

  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, body, 'utf8');
}

export function persistenceMode(): 'neon' | 'local-file' {
  return databaseConfigured() ? 'neon' : 'local-file';
}
