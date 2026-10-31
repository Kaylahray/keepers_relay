import { neon } from '@neondatabase/serverless';
import { ccc } from '@ckb-ccc/core';
import { databaseConfigured } from '@/lib/db/client';
import { getServerCkbClient } from '@/lib/ckb/server-client';
import { ApiError } from '@/lib/server/errors';
import { normalizeAddress } from '@/lib/server/auth';
import { roomFromStored, type CrownRoom, type CrownStatus, type GameId } from '@/lib/crown/rooms';
import type { CrownSeat } from '@/lib/crown/seats';
import { suddenDeathMatchType } from '@/lib/registry/config';
import { bytesToHex, decodeMatchCell, hexToBytes } from '@/lib/sudden-death/codec';

/** Every crown ever taken, one row per steal transaction. */

let ready = false;

function sql() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new ApiError('DATABASE_URL is required for player stats.', 503);
  return neon(url);
}

async function ensureStealsTable(): Promise<void> {
  if (ready) return;
  await sql()`
    CREATE TABLE IF NOT EXISTS keepers_crown_steals (
      tx_hash text PRIMARY KEY,
      crown_id text NOT NULL,
      round integer NOT NULL,
      king_hash text NOT NULL,
      score integer NOT NULL,
      pot_shannons text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql()`CREATE INDEX IF NOT EXISTS keepers_crown_steals_king ON keepers_crown_steals (king_hash)`;
  ready = true;
}

function matchTypeScript(room: CrownRoom): ccc.Script | null {
  if (!room.matchId || !room.hostLockHash || suddenDeathMatchType.codeHash.length <= 2) return null;
  return ccc.Script.from({
    codeHash: suddenDeathMatchType.codeHash,
    hashType: suddenDeathMatchType.hashType,
    args: `0x${room.matchId.replace(/^0x/, '')}${room.hostLockHash.replace(/^0x/, '')}`,
  });
}

/** Reads every committed transaction of one match and records the ones that crowned someone. */
async function recordSteals(room: CrownRoom): Promise<number> {
  const script = matchTypeScript(room);
  if (!script) return 0;
  const client = getServerCkbClient();
  const typeHash = script.hash().toLowerCase();
  const seen = new Set<string>();
  let added = 0;
  for await (const item of client.findTransactionsByType(script, true, 'asc')) {
    const txHash = item.txHash;
    if (seen.has(txHash)) continue;
    seen.add(txHash);
    const response = await client.getTransaction(txHash).catch(() => null);
    const tx = response?.transaction;
    if (!tx || response?.status !== 'committed') continue;
    const index = tx.outputs.findIndex((output) => output.type?.hash().toLowerCase() === typeHash);
    // The close writes no match cell. The open writes one with nobody crowned.
    if (index < 0) continue;
    let decoded;
    try {
      decoded = decodeMatchCell(hexToBytes(tx.outputsData[index]!));
    } catch {
      continue;
    }
    if (decoded.king.every((byte) => byte === 0)) continue;
    const rows = await sql()`
      INSERT INTO keepers_crown_steals (tx_hash, crown_id, round, king_hash, score, pot_shannons)
      VALUES (${txHash}, ${room.id}, ${decoded.round}, ${bytesToHex(decoded.king).toLowerCase()},
              ${Number(decoded.kingScore)}, ${decoded.pot.toString()})
      ON CONFLICT (tx_hash) DO NOTHING
      RETURNING tx_hash
    `;
    added += rows.length;
  }
  return added;
}

type StoredVault = { room: Parameters<typeof roomFromStored>[0]; hostAddress: string | null; seats?: CrownSeat[] };

async function allCrowns(): Promise<{ room: CrownRoom; hostAddress: string | null; seats: CrownSeat[] }[]> {
  const rows = await sql()`SELECT payload FROM keepers_crowns`;
  return rows
    .map((row) => row.payload as StoredVault)
    .map((vault) => ({
      room: roomFromStored(vault.room),
      hostAddress: vault.hostAddress ? normalizeAddress(vault.hostAddress) : null,
      seats: Array.isArray(vault.seats) ? vault.seats : [],
    }))
    .filter((entry) => !entry.room.legacy);
}

/** Brings the steals table up to date with the chain. */
export async function syncStealHistory(): Promise<{ scanned: number; added: number }> {
  if (!databaseConfigured()) return { scanned: 0, added: 0 };
  await ensureStealsTable();
  const crowns = await allCrowns();
  const recorded = await sql()`SELECT crown_id, max(round) AS round FROM keepers_crown_steals GROUP BY crown_id`;
  const latest = new Map(recorded.map((row) => [row.crown_id as string, Number(row.round)]));
  let scanned = 0;
  let added = 0;
  for (const { room } of crowns) {
    if (!room.matchId || room.round < 2) continue;
    if ((latest.get(room.id) ?? 0) >= room.round) continue;
    scanned += 1;
    try {
      added += await recordSteals(room);
    } catch (error) {
      console.warn(`[crowns] could not read the history of ${room.id}:`, error);
    }
  }
  return { scanned, added };
}

export type PlayerCrown = {
  id: string;
  title: string;
  game: GameId;
  status: CrownStatus;
  potShannons: string;
  round: number;
  kingScore: number;
  deadlineAt: number | null;
  hosted: boolean;
  /** This player's best score in it, when they took it at least once. */
  bestScore: number | null;
  /** This player holds it now (live) or held it when it closed (won). */
  holds: boolean;
};

export type PlayerStats = {
  address: string;
  wins: number;
  wonShannons: string;
  crownsTaken: number;
  bestScore: number | null;
  holding: number;
  hosted: number;
  crowns: PlayerCrown[];
};

export async function playerStats(rawAddress: string): Promise<PlayerStats> {
  const address = normalizeAddress(rawAddress);
  let lockHash: string;
  try {
    lockHash = (await ccc.Address.fromString(rawAddress.trim(), getServerCkbClient())).script.hash().toLowerCase();
  } catch {
    throw new ApiError('That is not a valid address on this network.', 400);
  }
  const empty: PlayerStats = {
    address,
    wins: 0,
    wonShannons: '0',
    crownsTaken: 0,
    bestScore: null,
    holding: 0,
    hosted: 0,
    crowns: [],
  };
  if (!databaseConfigured()) return empty;

  await syncStealHistory().catch((error) => console.warn('[crowns] steal history sync failed:', error));
  await ensureStealsTable();

  const steals = await sql()`
    SELECT crown_id, count(*)::int AS taken, max(score)::int AS best
    FROM keepers_crown_steals WHERE king_hash = ${lockHash} GROUP BY crown_id
  `;
  const takenIn = new Map(steals.map((row) => [row.crown_id as string, { taken: Number(row.taken), best: Number(row.best) }]));

  const stats = { ...empty };
  for (const { room, hostAddress, seats } of await allCrowns()) {
    const hosted = hostAddress === address;
    const seated = seats.some((seat) => normalizeAddress(seat.address) === address);
    const mine = takenIn.get(room.id);
    const holds = Boolean(room.matchId && room.kingHash && room.kingHash.toLowerCase() === lockHash);
    if (!hosted && !seated && !mine && !holds) continue;

    if (hosted) stats.hosted += 1;
    if (holds && room.status === 'settled') {
      stats.wins += 1;
      stats.wonShannons = (BigInt(stats.wonShannons) + room.potShannons).toString();
    }
    if (holds && room.status === 'live') stats.holding += 1;
    if (mine) {
      stats.crownsTaken += mine.taken;
      stats.bestScore = Math.max(stats.bestScore ?? 0, mine.best);
    }
    stats.crowns.push({
      id: room.id,
      title: room.title,
      game: room.game,
      status: room.status,
      potShannons: room.potShannons.toString(),
      round: room.round,
      kingScore: room.kingScore,
      deadlineAt: room.deadlineAt,
      hosted,
      bestScore: mine?.best ?? null,
      holds,
    });
  }
  const order: Record<CrownStatus, number> = { live: 0, lobby: 1, settled: 2 };
  stats.crowns.sort((a, b) => order[a.status] - order[b.status] || (b.deadlineAt ?? 0) - (a.deadlineAt ?? 0));
  return stats;
}
