import { neon } from '@neondatabase/serverless';
import { and, eq } from 'drizzle-orm';
import { ccc } from '@ckb-ccc/core';
import { getDb, databaseConfigured } from '@/lib/db/client';
import { crownAttempts } from '@/lib/db/schema';
import { getServerCkbClient } from '@/lib/ckb/server-client';
import { readLiveCell } from '@/lib/ckb/live-cell';
import { ApiError } from '@/lib/server/errors';
import { normalizeAddress } from '@/lib/server/auth';
import { roomFromStored, roomToStored, type CrownRoom } from '@/lib/crown/rooms';
import { inEntryWindow } from '@/lib/crown/phase';
import { suddenDeathMatchType } from '@/lib/registry/config';
import { bytesToHex, decodeMatchCell, hexToBytes, merkleRoot, stealProof } from '@/lib/sudden-death/codec';
import type { CrownSeat } from '@/lib/crown/seats';

export type { CrownSeat };

type Vault = {
  room: ReturnType<typeof roomToStored>;
  hostAddress: string | null;
  seats: CrownSeat[];
};

let tablesReady = false;

function sqlClient() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new ApiError('DATABASE_URL is required to share a crown.', 503);
  return neon(url);
}

export async function ensureCrownTables(): Promise<void> {
  if (tablesReady || !databaseConfigured()) return;
  const sql = sqlClient();
  await sql`
    CREATE TABLE IF NOT EXISTS keepers_crowns (
      id text PRIMARY KEY,
      payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS keepers_crown_attempts (
      crown_id text NOT NULL,
      address text NOT NULL,
      cursor integer NOT NULL,
      choice integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (crown_id, address, cursor)
    )
  `;
  tablesReady = true;
}

function asVault(raw: unknown): Vault {
  const value = raw as Vault;
  return {
    room: value.room,
    hostAddress: value.hostAddress ?? null,
    seats: Array.isArray(value.seats) ? value.seats : [],
  };
}

export function publicRoom(room: CrownRoom): CrownRoom {
  return {
    ...room,
    answersOnServer: true,
    questions: room.questions.map((question) => ({
      ...question,
      correct: 0 as const,
      salt: new Uint8Array(32),
    })),
  };
}

function sameHex(left: string, right: string): boolean {
  return left.trim().toLowerCase().replace(/^0x/, '') === right.trim().toLowerCase().replace(/^0x/, '');
}

export async function listCrownVaults(): Promise<CrownRoom[]> {
  if (!databaseConfigured()) return [];
  await ensureCrownTables();
  const sql = sqlClient();
  const rows = await sql`SELECT payload FROM keepers_crowns ORDER BY updated_at DESC LIMIT 40`;
  return rows.map((row) => publicRoom(roomFromStored(asVault(row.payload).room)));
}

export async function readVault(id: string): Promise<Vault | null> {
  if (!databaseConfigured()) return null;
  await ensureCrownTables();
  const sql = sqlClient();
  const rows = await sql`SELECT payload FROM keepers_crowns WHERE id = ${id} LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  return asVault(row.payload);
}

async function writeVault(vault: Vault): Promise<void> {
  await ensureCrownTables();
  const sql = sqlClient();
  const payload = JSON.stringify(vault);
  await sql`
    INSERT INTO keepers_crowns (id, payload, updated_at)
    VALUES (${vault.room.id}, ${payload}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
  `;
}

function pointIndex(index: unknown): string {
  if (typeof index === 'string') return index.startsWith('0x') ? index : `0x${Number(index).toString(16)}`;
  if (typeof index === 'number' || typeof index === 'bigint') return `0x${index.toString(16)}`;
  return '0x0';
}

/**
 * The stored outpoint is spent on every steal. The live cell is the one with this match type.
 *
 * The stored point has to be read with `readLiveCell`, not `getCell`: `getCell` rebuilds a cell
 * from the transaction that created it, so a spent match cell answers happily with the round it
 * was written in. That answer is the whole reason a steal used to show up on one screen only —
 * the fast path never missed, the type search below never ran, and the server kept serving the
 * round the match opened on.
 */
/**
 * Read a steal out of the transaction a player says they just sent.
 *
 * Other screens need the new round before the indexer has the new cell, so something has to be
 * believed early. The transaction itself can be believed; the player's JSON cannot. This fetches
 * the transaction — mempool is fine — and checks it really is a steal of *this* match before
 * taking the new state from the cell bytes it writes, never from the request body.
 *
 * Without this check a seated player could PUT any round, deadline, pot and king they liked
 * alongside a transaction hash that does not exist, and every other screen would follow it.
 */
async function stealFromTransaction(txHash: string, current: CrownRoom): Promise<CrownRoom | null> {
  if (!current.matchOutPoint) return null;
  const script = matchTypeScript(current);
  if (!script) return null;

  const response = await getServerCkbClient()
    .getTransaction(txHash)
    .catch(() => null);
  const tx = response?.transaction;
  if (!tx || response?.status === 'rejected') return null;

  // A steal spends the match cell this room already points at, as input 0.
  const spent = tx.inputs[0]?.previousOutput;
  if (!spent || !sameHex(spent.txHash, current.matchOutPoint.txHash)) return null;
  if (ccc.numFrom(spent.index) !== ccc.numFrom(current.matchOutPoint.index)) return null;

  const typeHash = script.hash().toLowerCase();
  const index = tx.outputs.findIndex(
    (output) => output.type?.hash().toLowerCase() === typeHash,
  );
  if (index < 0) return null;

  let decoded;
  try {
    decoded = decodeMatchCell(hexToBytes(tx.outputsData[index]!));
  } catch {
    return null;
  }

  // Same bank, and exactly one round forward. Anything else is not a steal of this match.
  const root = merkleRoot(hexToBytes(current.matchId!), current.questions);
  if (!sameHex(bytesToHex(root), bytesToHex(decoded.root))) return null;
  if (decoded.round !== current.round + 1) return null;

  const kingHex = bytesToHex(decoded.king);
  const kingEmpty = decoded.king.every((byte) => byte === 0);
  return {
    ...current,
    status: 'live',
    round: decoded.round,
    cursor: Math.min(current.questions.length, Math.max(0, decoded.round - 1)),
    potShannons: decoded.pot,
    feeShannons: decoded.fee,
    deadlineAt: Number(decoded.deadlineMs),
    king: kingEmpty ? null : `${kingHex.slice(0, 10)}…${kingHex.slice(-4)}`,
    matchOutPoint: { txHash, index: pointIndex(index) },
    treasuryOutPoint: { txHash, index: '0x1' },
  };
}

async function outpointPhase(txHash: string): Promise<'committed' | 'pending' | 'rejected' | 'unknown'> {
  try {
    const tx = await getServerCkbClient().getTransaction(txHash);
    const status = tx?.status;
    if (status === 'committed' || status === 'rejected') return status;
    if (status) return 'pending';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

async function loadMatchCell(room: CrownRoom): Promise<ccc.Cell | null> {
  const client = getServerCkbClient();
  if (room.matchOutPoint) {
    // A steal's new outpoint is shared before it confirms. Searching by type here would
    // find the previous live cell and rewind every other screen to the old clock.
    const phase = await outpointPhase(room.matchOutPoint.txHash);
    if (phase !== 'committed') return null;
    const stored = await readLiveCell(client, room.matchOutPoint);
    if (stored?.outputData) return stored;
    // Dead (a steal moved the match on) or not indexed yet. Find the cell by its type.
  }
  const script = matchTypeScript(room);
  if (!script) {
    if (room.matchId && suddenDeathMatchType.codeHash.length <= 2) {
      console.warn(
        '[crowns] NEXT_PUBLIC_SD_MATCH_* is not set on the server, so a steal cannot be read back from chain.',
      );
    }
    return null;
  }
  for await (const cell of client.findCells(
    { script, scriptType: 'type', scriptSearchMode: 'exact', withData: true },
    'desc',
    1,
  )) {
    return cell;
  }
  return null;
}

function matchTypeScript(room: CrownRoom): ccc.Script | null {
  if (!room.matchId || !room.hostLockHash || suddenDeathMatchType.codeHash.length <= 2) return null;
  return ccc.Script.from({
    codeHash: suddenDeathMatchType.codeHash,
    hashType: suddenDeathMatchType.hashType,
    args: `0x${room.matchId.replace(/^0x/, '')}${room.hostLockHash.replace(/^0x/, '')}`,
  });
}

/**
 * Cleanup spends the match cell and does not create another one.
 * A steal spends it and writes a new one, so the latest transaction still has an output.
 * No live cell plus a latest transaction that only spends this type means the crown is closed.
 */
async function matchWasClosed(room: CrownRoom): Promise<boolean> {
  const script = matchTypeScript(room);
  if (!script) return false;
  const client = getServerCkbClient();
  for await (const tx of client.findTransactionsByType(script, true, 'desc', 1)) {
    const cells = 'cells' in tx ? tx.cells : [];
    if (cells.length === 0) return false;
    return cells.every((cell) => cell.isInput);
  }
  return false;
}

/** Read the match cell when it is on chain. Pending transactions stay as the last saved room. */
async function refreshFromChain(room: CrownRoom): Promise<{ room: CrownRoom; seen: 'match' | 'pending' | 'reject' }> {
  if (!room.matchOutPoint || !room.matchId) return { room, seen: 'pending' };
  try {
    const cell = await loadMatchCell(room);
    if (!cell) {
      if (await matchWasClosed(room)) {
        return { seen: 'match', room: { ...room, status: 'settled' } };
      }
      return { room, seen: 'pending' };
    }
    const raw = hexToBytes(cell.outputData);
    if (raw.length < 2) return { room, seen: 'reject' };
    const decoded = decodeMatchCell(raw);
    const root = merkleRoot(hexToBytes(room.matchId), room.questions);
    if (!sameHex(bytesToHex(root), bytesToHex(decoded.root))) return { room, seen: 'reject' };
    // Rounds only ever climb. A lower one means a stale read, and taking it would hand every
    // screen back a question it has already answered.
    if (decoded.round < room.round) return { room, seen: 'pending' };
    const kingHex = bytesToHex(decoded.king);
    const kingEmpty = decoded.king.every((byte) => byte === 0);
    const kingMatches = room.kingLock
      ? sameHex(ccc.Script.from(room.kingLock).hash(), kingHex)
      : false;
    const found = cell.outPoint
      ? { txHash: cell.outPoint.txHash, index: pointIndex(cell.outPoint.index) }
      : room.matchOutPoint;
    const moved = Boolean(found && room.matchOutPoint && !sameHex(found.txHash, room.matchOutPoint.txHash));
    return {
      seen: 'match',
      room: {
        ...room,
        // Byte 1 is the script status: 0 live, 1 dead. A fresh match is 0.
        status: raw[1] === 0 ? 'live' : 'settled',
        round: decoded.round,
        cursor: Math.min(room.questions.length, Math.max(0, decoded.round - 1)),
        potShannons: decoded.pot,
        feeShannons: decoded.fee,
        deadlineAt: Number(decoded.deadlineMs),
        king: kingMatches ? room.king : kingEmpty ? null : `${kingHex.slice(0, 10)}…${kingHex.slice(-4)}`,
        kingLock: kingMatches ? room.kingLock : null,
        matchOutPoint: found,
        treasuryOutPoint: moved ? { txHash: found.txHash, index: '0x1' } : room.treasuryOutPoint,
      },
    };
  } catch {
    return { room, seen: 'pending' };
  }
}

/**
 * How long one chain read is shared across requests.
 *
 * Every player polls this room twice a second. Without this, a thirty-seat lobby is sixty CKB
 * RPC calls a second, all asking the same question about the same cell, and the node starts
 * refusing exactly when the room is busiest. Holding the answer for a second turns the whole
 * lobby into one read. The poll is 2s, so nobody waits longer for a steal than they already did.
 */
const CHAIN_TTL_MS = 1_000;

const chainReads = new Map<string, { at: number; task: Promise<ChainLook> }>();

type ChainLook = { room: CrownRoom; seen: 'match' | 'pending' | 'reject' };

/** Shares one in-flight chain read between every request that wants it. */
function refreshCached(room: CrownRoom): Promise<ChainLook> {
  const hit = chainReads.get(room.id);
  if (hit && Date.now() - hit.at < CHAIN_TTL_MS) return hit.task;
  const task = refreshFromChain(room);
  chainReads.set(room.id, { at: Date.now(), task });
  if (chainReads.size > 256) {
    const cutoff = Date.now() - CHAIN_TTL_MS;
    for (const [key, value] of chainReads) if (value.at < cutoff) chainReads.delete(key);
  }
  return task;
}

/** A steal just landed, or a seat changed. The next read must go to the node. */
export function forgetChainRead(id: string): void {
  chainReads.delete(id);
}

/** Fields the chain owns. Writing the vault back when none of them moved is a wasted round trip. */
function sameLiveState(left: CrownRoom, right: CrownRoom): boolean {
  return (
    left.status === right.status &&
    left.round === right.round &&
    left.cursor === right.cursor &&
    left.potShannons === right.potShannons &&
    left.deadlineAt === right.deadlineAt &&
    left.king === right.king &&
    left.matchOutPoint?.txHash === right.matchOutPoint?.txHash &&
    left.treasuryOutPoint?.txHash === right.treasuryOutPoint?.txHash
  );
}

export async function readPublicCrown(id: string): Promise<{ room: CrownRoom; seats: CrownSeat[] } | null> {
  const existing = await readVault(id);
  if (!existing) return null;
  const current = roomFromStored(existing.room);
  const refreshed = await refreshCached(current);
  // Only write when the chain actually moved. This used to run on every poll from every
  // player, so a full lobby wrote the same row to Neon dozens of times a second.
  if (refreshed.seen === 'match' && !sameLiveState(current, refreshed.room)) {
    await writeVault({ ...existing, room: roomToStored(refreshed.room) });
  }
  return { room: publicRoom(refreshed.room), seats: existing.seats };
}

export async function createCrown(room: CrownRoom, hostAddress: string): Promise<void> {
  if (!databaseConfigured()) throw new ApiError('DATABASE_URL is required to share a crown.', 503);
  const host = normalizeAddress(hostAddress);
  const stored = roomToStored({ ...room, hostAddress: host, answersOnServer: false });
  await writeVault({ room: stored, hostAddress: host, seats: [] });
}

export async function syncCrown(incoming: CrownRoom, sessionAddress: string): Promise<CrownRoom> {
  const existing = await readVault(incoming.id);
  if (!existing) throw new ApiError('Crown not found.', 404);
  const session = normalizeAddress(sessionAddress);
  const host = existing.hostAddress ? normalizeAddress(existing.hostAddress) : null;
  const seated = existing.seats.some((seat) => seat.address === session);
  if (session !== host && !seated) {
    throw new ApiError('Only the host or a seated player can update this crown.', 403);
  }
  const current = roomFromStored(existing.room);
  let next: CrownRoom = {
    ...current,
    hostAddress: host,
  };
  const fromHost = session === host;
  if (incoming.matchOutPoint) {
    // Identity — which bank, whose host lock — is the host's to set, and only once.
    // A seated player may only point the room at a newer cell of that same match,
    // which is what their own steal produces.
    const trial: CrownRoom = {
      ...next,
      matchOutPoint: incoming.matchOutPoint,
      treasuryOutPoint: incoming.treasuryOutPoint ?? next.treasuryOutPoint,
      matchId: fromHost ? incoming.matchId ?? next.matchId : next.matchId,
      hostLock: fromHost ? incoming.hostLock ?? next.hostLock : next.hostLock,
      hostLockHash: fromHost ? incoming.hostLockHash ?? next.hostLockHash : next.hostLockHash,
      openedAt: fromHost ? incoming.openedAt ?? next.openedAt : next.openedAt,
    };
    if (fromHost || trial.matchId) {
      const checked = await refreshFromChain(trial);
      if (checked.seen === 'reject') {
        throw new ApiError('That match cell does not belong to this bank.', 400);
      }
      // The host opens the match, so their cell is still in the mempool and is taken on trust.
      // A player's steal is taken the same way: the other screens need the new clock before
      // the indexer has the new cell. A rejected transaction is ignored.
      if (checked.seen === 'match') {
        next = checked.room;
      } else if (fromHost) {
        next = {
          ...trial,
          status: incoming.status,
          round: incoming.round,
          cursor: incoming.cursor,
          deadlineAt: incoming.deadlineAt ?? trial.deadlineAt,
          potShannons: incoming.potShannons,
          king: incoming.king ?? trial.king,
        };
      } else {
        // The new state comes out of the transaction, not out of the request. A player who
        // sends a real steal moves the room; a player who sends a story does not.
        const stolen = await stealFromTransaction(incoming.matchOutPoint.txHash, current);
        if (stolen) {
          next = { ...stolen, kingLock: incoming.kingLock ?? trial.kingLock };
        }
      }
    }
  }
  if (incoming.kingLock) {
    next = { ...next, kingLock: incoming.kingLock, king: incoming.king ?? next.king };
    const checked = await refreshFromChain(next);
    if (checked.seen === 'match') next = checked.room;
  }
  // A room with no match cell has no chain to read, so the clock and the cursor live here.
  // Nothing is at stake in that mode — it is the demo floor, not a pot. Only the host may
  // start such a room; a player may move one the host has already started.
  if (!next.matchId && (fromHost || current.status === 'live')) {
    next = {
      ...next,
      status: incoming.status,
      round: incoming.round,
      cursor: incoming.cursor,
      potShannons: incoming.potShannons,
      king: incoming.king ?? next.king,
      openedAt: incoming.openedAt ?? next.openedAt,
      deadlineAt: incoming.deadlineAt ?? next.deadlineAt,
      feed: incoming.feed.length ? incoming.feed : next.feed,
      seals: incoming.seals.length ? incoming.seals : next.seals,
    };
  }
  await writeVault({
    room: roomToStored(next),
    hostAddress: host,
    seats: existing.seats,
  });
  // A steal or a kickoff just changed the cell this room reads. Do not serve the old look.
  forgetChainRead(incoming.id);
  return publicRoom(next);
}

export async function joinCrown(
  id: string,
  seat: { address: string; displayName: string; bidOutPoint?: CrownSeat['bidOutPoint']; clearBid?: boolean },
): Promise<{ room: CrownRoom; seats: CrownSeat[] }> {
  const existing = await readVault(id);
  if (!existing) throw new ApiError('Crown not found.', 404);
  const now = Date.now();
  const address = normalizeAddress(seat.address);
  const seats = existing.seats.slice();
  const found = seats.find((item) => item.address === address);
  if (found) {
    found.displayName = seat.displayName || found.displayName;
    found.lastSeenAt = now;
    if (seat.clearBid) found.bidOutPoint = null;
    else if (seat.bidOutPoint) found.bidOutPoint = seat.bidOutPoint;
  } else {
    seats.push({
      address,
      displayName: seat.displayName || `${address.slice(0, 8)}…`,
      joinedAt: now,
      lastSeenAt: now,
      bidOutPoint: seat.bidOutPoint ?? null,
    });
    const room = roomFromStored(existing.room);
    room.feed = [
      { id: `${now}`, text: `${seat.displayName || 'A player'} joined the lobby.`, good: true },
      ...room.feed,
    ].slice(0, 8);
    existing.room = roomToStored(room);
  }
  await writeVault({ ...existing, seats });
  // Heartbeats arrive every 8s from every seat. They must not each cost a chain read.
  const refreshed = await refreshCached(roomFromStored(existing.room));
  return { room: publicRoom(refreshed.room), seats };
}

/** Host removes a lobby that never started, or a crown that is already closed. */
export async function deleteCrown(id: string, sessionAddress: string): Promise<void> {
  const existing = await readVault(id);
  if (!existing) throw new ApiError('Crown not found.', 404);
  const host = existing.hostAddress ? normalizeAddress(existing.hostAddress) : null;
  if (!host || normalizeAddress(sessionAddress) !== host) {
    throw new ApiError('Only the host can delete this crown.', 403);
  }
  const refreshed = await refreshFromChain(roomFromStored(existing.room));
  const room = refreshed.room;
  const stillOpen = room.status === 'live' || (room.matchOutPoint != null && room.status !== 'settled');
  if (stillOpen) {
    throw new ApiError('Close the crown before deleting it. The cell is still on chain.', 400);
  }
  const sql = sqlClient();
  await sql`DELETE FROM keepers_crown_attempts WHERE crown_id = ${id}`;
  await sql`DELETE FROM keepers_crowns WHERE id = ${id}`;
}

export async function proofForChoice(
  id: string,
  choice: number,
  address: string,
): Promise<{ ok: false; closed?: boolean } | { ok: true; proof: string }> {
  if (!Number.isInteger(choice) || choice < 0 || choice > 3) {
    throw new ApiError('Pick one of the four options.', 400);
  }
  const existing = await readVault(id);
  if (!existing) throw new ApiError('Crown not found.', 404);
  const refreshed = await refreshFromChain(roomFromStored(existing.room));
  const room = refreshed.room;
  if (room.status !== 'live') throw new ApiError('The clock is not open for answers.', 400);
  // The entry window is the time everyone needs to lock an entry. Handing out a proof before it
  // ends would let whoever locked first start the round alone. This sits ahead of the attempt
  // insert below on purpose: an early click must not use up a wallet's one try on the question.
  if (inEntryWindow(room, Date.now())) {
    throw new ApiError('The round has not started. Lock your entry; the question opens for everyone together.', 400);
  }
  const question = room.questions[room.cursor];
  if (!question) throw new ApiError('That question is not in this crown.', 404);
  const player = normalizeAddress(address);
  await ensureCrownTables();
  const db = getDb();
  const inserted = await db
    .insert(crownAttempts)
    .values({ crownId: id, address: player, cursor: room.cursor, choice })
    .onConflictDoNothing()
    .returning();
  const stored =
    inserted[0] ??
    (
      await db
        .select()
        .from(crownAttempts)
        .where(
          and(
            eq(crownAttempts.crownId, id),
            eq(crownAttempts.address, player),
            eq(crownAttempts.cursor, room.cursor),
          ),
        )
    )[0];
  if (!stored) throw new ApiError('The attempt could not be saved.', 500);
  if (stored.choice !== choice) return { ok: false, closed: true };
  if (choice !== question.correct) {
    if (inserted[0]) {
      room.feed = [
        {
          id: `${Date.now()}`,
          text: 'Miss. That question is closed for this wallet. The cell does not move.',
          good: false,
        },
        ...room.feed,
      ].slice(0, 8);
      await writeVault({ ...existing, room: roomToStored(room) });
    }
    return { ok: false, closed: true };
  }
  const matchId = room.matchId ? hexToBytes(room.matchId) : new Uint8Array(32);
  const proof = stealProof(matchId, room.questions, room.cursor);
  return { ok: true, proof: bytesToHex(proof) };
}
