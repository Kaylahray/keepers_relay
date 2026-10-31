import { neon } from '@neondatabase/serverless';
import { ccc } from '@ckb-ccc/core';
import { databaseConfigured } from '@/lib/db/client';
import { getServerCkbClient } from '@/lib/ckb/server-client';
import { readLiveCell } from '@/lib/ckb/live-cell';
import { ApiError } from '@/lib/server/errors';
import { normalizeAddress } from '@/lib/server/auth';
import { chainUsernameOfLockHash, chainUsernames } from '@/lib/server/username-registry';
import { roomFromStored, roomToStored, type CrownRoom } from '@/lib/crown/rooms';
import { suddenDeathMatchType } from '@/lib/registry/config';
import { bytesToHex, decodeMatchCell, hexToBytes } from '@/lib/sudden-death/codec';
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

/**
 * Nothing in a v2 room is secret: the winner is whoever the chain says, by score.
 *
 * A practice crown has no match cell, so nothing on chain ever closes it. Once its clock has run
 * out it is over, whatever the stored row says; otherwise it would show as live forever.
 */
export function publicRoom(room: CrownRoom): CrownRoom {
  if (!room.matchId && room.status === 'live' && room.deadlineAt != null && room.deadlineAt < Date.now()) {
    return { ...room, status: 'settled' };
  }
  return room;
}

/** A lobby nobody has opened or sat in for two days is abandoned; the list stops showing it. */
const STALE_LOBBY_MS = 2 * 24 * 60 * 60 * 1000;

function sameHex(left: string, right: string): boolean {
  return left.trim().toLowerCase().replace(/^0x/, '') === right.trim().toLowerCase().replace(/^0x/, '');
}

export async function listCrownVaults(): Promise<CrownRoom[]> {
  if (!databaseConfigured()) return [];
  await ensureCrownTables();
  const sql = sqlClient();
  const rows = await sql`SELECT payload, updated_at FROM keepers_crowns ORDER BY updated_at DESC LIMIT 40`;
  const cutoff = Date.now() - STALE_LOBBY_MS;
  const vaults = rows
    .filter((row) => !(asVault(row.payload).room.status === 'lobby' && new Date(row.updated_at).getTime() < cutoff))
    .map((row) => asVault(row.payload))
    .map((vault) => ({ room: roomFromStored(vault.room), seats: vault.seats }))
    .filter(({ room }) => !room.legacy);
  // The cards show the king by name, the same name the lobby shows.
  return Promise.all(vaults.map(async ({ room, seats }) => publicRoom(await nameKing(room, seats))));
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

  // Exactly one round forward, with a higher score. The match script checks the rest when the
  // transaction lands; a pending one that would fail it is rejected and the room reads back.
  if (decoded.round !== current.round + 1) return null;
  if (Number(decoded.kingScore) <= current.kingScore) return null;

  const kingHex = bytesToHex(decoded.king);
  const kingEmpty = decoded.king.every((byte) => byte === 0);
  return {
    ...current,
    status: 'live',
    round: decoded.round,
    kingScore: Number(decoded.kingScore),
    potShannons: decoded.pot,
    feeShannons: decoded.fee,
    deadlineAt: Number(decoded.deadlineMs),
    king: kingEmpty ? null : shortHash(kingHex),
    kingHash: kingEmpty ? null : kingHex,
    matchOutPoint: { txHash, index: pointIndex(index) },
    treasuryOutPoint: { txHash, index: '0x1' },
  };
}

function shortHash(hex: string): string {
  return `${hex.slice(0, 10)}…${hex.slice(-4)}`;
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

/**
 * The live match cell, and whether the room's own pointer turned out to be wrong.
 *
 * `reset` is true when the transaction the room points at was rejected: a steal that lost a race
 * for the same cell, or one whose run the script refused. Every screen followed it while it was
 * pending; now the room has to go back to whatever the chain really holds, even if that is an
 * earlier round.
 */
async function loadMatchCell(room: CrownRoom): Promise<{ cell: ccc.Cell; reset: boolean } | null> {
  const client = getServerCkbClient();
  let reset = false;
  if (room.matchOutPoint) {
    // A steal's new outpoint is shared before it confirms. Searching by type here would
    // find the previous live cell and rewind every other screen to the old clock.
    const phase = await outpointPhase(room.matchOutPoint.txHash);
    if (phase === 'rejected') {
      reset = true;
    } else {
      if (phase !== 'committed') return null;
      const stored = await readLiveCell(client, room.matchOutPoint);
      if (stored?.outputData) return { cell: stored, reset };
    }
    // Dead (a steal moved the match on), rejected, or not indexed yet. Find the cell by its type.
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
    return { cell, reset };
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
    const found = await loadMatchCell(room);
    if (!found) {
      if (await matchWasClosed(room)) {
        return { seen: 'match', room: { ...room, status: 'settled' } };
      }
      return { room, seen: 'pending' };
    }
    const { cell, reset } = found;
    const raw = hexToBytes(cell.outputData);
    let decoded;
    try {
      decoded = decodeMatchCell(raw);
    } catch {
      // Not a version 2 match cell, so not one this app can play.
      return { room, seen: 'reject' };
    }
    // Rounds only ever climb. A lower one means a stale read, and taking it would hand every
    // screen back a king who has already lost the crown.
    if (decoded.round < room.round && !reset) return { room, seen: 'pending' };
    const kingHex = bytesToHex(decoded.king);
    const kingEmpty = decoded.king.every((byte) => byte === 0);
    const kingMatches = room.kingLock
      ? sameHex(ccc.Script.from(room.kingLock).hash(), kingHex)
      : false;
    const at = cell.outPoint
      ? { txHash: cell.outPoint.txHash, index: pointIndex(cell.outPoint.index) }
      : room.matchOutPoint;
    const moved = Boolean(at && room.matchOutPoint && !sameHex(at.txHash, room.matchOutPoint.txHash));
    return {
      seen: 'match',
      room: {
        ...room,
        // Byte 1 is the script status: 0 live, 1 dead. A fresh match is 0.
        status: raw[1] === 0 ? 'live' : 'settled',
        round: decoded.round,
        kingScore: Number(decoded.kingScore),
        potShannons: decoded.pot,
        feeShannons: decoded.fee,
        deadlineAt: Number(decoded.deadlineMs),
        king: kingMatches && room.king ? room.king : kingEmpty ? null : shortHash(kingHex),
        kingHash: kingEmpty ? null : kingHex,
        kingLock: kingMatches ? room.kingLock : null,
        matchOutPoint: at,
        treasuryOutPoint: moved ? { txHash: at!.txHash, index: '0x1' } : room.treasuryOutPoint,
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
    left.kingScore === right.kingScore &&
    left.potShannons === right.potShannons &&
    left.deadlineAt === right.deadlineAt &&
    left.king === right.king &&
    left.matchOutPoint?.txHash === right.matchOutPoint?.txHash &&
    left.treasuryOutPoint?.txHash === right.treasuryOutPoint?.txHash
  );
}

/** Lock hashes of seated addresses, so the king can be named without trusting a browser. */
const seatLockHashes = new Map<string, string | null>();

async function lockHashOf(address: string): Promise<string | null> {
  if (seatLockHashes.has(address)) return seatLockHashes.get(address)!;
  let hash: string | null = null;
  try {
    hash = (await ccc.Address.fromString(address, getServerCkbClient())).script.hash().toLowerCase();
  } catch {
    hash = null;
  }
  seatLockHashes.set(address, hash);
  return hash;
}

/**
 * The king's name, from the chain's king hash and the lobby's seats. A seat whose address locks to
 * that hash names the king; anyone else shows as a short hash. Nothing a browser sends sets it.
 */
async function nameKing(room: CrownRoom, seats: CrownSeat[]): Promise<CrownRoom> {
  if (!room.kingHash) return room;
  // The king's username on chain is the name, whether or not they ever sat in this lobby.
  const onChain = await chainUsernameOfLockHash(room.kingHash).catch(() => null);
  if (onChain) return { ...room, king: onChain };
  for (const seat of seats) {
    if ((await lockHashOf(seat.address)) === room.kingHash.toLowerCase()) {
      return { ...room, king: seat.displayName };
    }
  }
  return { ...room, king: shortHash(room.kingHash) };
}

/**
 * Seats as the lobby should show them: each player under their on-chain username. A seat keeps
 * the name it was saved with when the player joined, which for older seats is a short address;
 * this puts the real name on every seat each time the lobby is read. If the chain cannot be read,
 * the saved names stand.
 */
async function nameSeats(seats: CrownSeat[]): Promise<CrownSeat[]> {
  const names = await chainUsernames().catch(() => null);
  if (!names) return seats;
  return seats.map((seat) => {
    const name = names.get(normalizeAddress(seat.address));
    return name ? { ...seat, displayName: name } : seat;
  });
}

/**
 * Older feed lines name players by a short address ("ckt1qrfr…rk7p9f joined the lobby"). Swap
 * those for usernames when the line is read; the stored line is left as it was.
 */
async function nameFeed(room: CrownRoom): Promise<CrownRoom> {
  const names = await chainUsernames().catch(() => null);
  if (!names || room.feed.length === 0) return room;
  const shortNames = new Map<string, string>();
  for (const [address, name] of names) shortNames.set(`${address.slice(0, 8)}…${address.slice(-6)}`, name);
  const feed = room.feed.map((item) => {
    let text = item.text;
    for (const [short, name] of shortNames) if (text.includes(short)) text = text.split(short).join(name);
    return text === item.text ? item : { ...item, text };
  });
  return { ...room, feed };
}

/** Names the king and, when the crown has moved since `before`, tells the whole lobby. */
async function announce(before: CrownRoom, after: CrownRoom, seats: CrownSeat[]): Promise<CrownRoom> {
  const named = await nameKing(after, seats);
  if (named.round <= before.round || !named.kingHash) return named;
  const pot = Number(named.potShannons) / 100_000_000;
  return {
    ...named,
    feed: [
      {
        id: `${Date.now()}-${named.round}`,
        text: `${named.king} took the crown with ${named.kingScore} · pot ${pot} CKB`,
        good: true,
      },
      ...named.feed,
    ].slice(0, 8),
  };
}

export async function readPublicCrown(id: string): Promise<{ room: CrownRoom; seats: CrownSeat[] } | null> {
  const existing = await readVault(id);
  if (!existing) return null;
  const current = roomFromStored(existing.room);
  const refreshed = await refreshCached(current);
  // Only write when the chain actually moved. This used to run on every poll from every
  // player, so a full lobby wrote the same row to Neon dozens of times a second.
  if (refreshed.seen === 'match' && !sameLiveState(current, refreshed.room)) {
    const named = await announce(current, refreshed.room, existing.seats);
    await writeVault({ ...existing, room: roomToStored(named) });
    return { room: publicRoom(await nameFeed(named)), seats: await nameSeats(existing.seats) };
  }
  return {
    room: publicRoom(await nameFeed(await nameKing(refreshed.room, existing.seats))),
    seats: await nameSeats(existing.seats),
  };
}

export async function createCrown(room: CrownRoom, hostAddress: string): Promise<void> {
  if (!databaseConfigured()) throw new ApiError('DATABASE_URL is required to share a crown.', 503);
  const host = normalizeAddress(hostAddress);
  const stored = roomToStored({ ...room, hostAddress: host });
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
  // Only the host opens the match, and only once. After that the host is a player like any
  // other: their steals are read from the transaction like everyone's.
  const opening = fromHost && !current.matchId;
  if (incoming.matchOutPoint) {
    // Identity — which match, whose host lock — is set by the open and never again.
    // Anyone may point the room at a newer cell of that same match, which is what a steal produces.
    const trial: CrownRoom = {
      ...next,
      matchOutPoint: incoming.matchOutPoint,
      treasuryOutPoint: incoming.treasuryOutPoint ?? next.treasuryOutPoint,
      matchId: opening ? incoming.matchId ?? next.matchId : next.matchId,
      hostLock: opening ? incoming.hostLock ?? next.hostLock : next.hostLock,
      hostLockHash: opening ? incoming.hostLockHash ?? next.hostLockHash : next.hostLockHash,
      openedAt: opening ? incoming.openedAt ?? next.openedAt : next.openedAt,
    };
    if (opening || trial.matchId) {
      const checked = await refreshFromChain(trial);
      if (checked.seen === 'reject') {
        throw new ApiError('That is not a version 2 match cell for this crown.', 400);
      }
      // The open is still in the mempool, so the host's deadline is taken on trust; everything
      // else about a fresh match is fixed (round 1, empty pot, nobody crowned) and is set here,
      // not copied from the request. A steal, from anyone, is read out of its transaction so the
      // other screens get the new clock before the indexer has the new cell.
      if (checked.seen === 'match') {
        next = checked.room;
      } else if (opening) {
        next = {
          ...trial,
          status: 'live',
          round: 1,
          kingScore: 0,
          potShannons: 0n,
          king: null,
          kingHash: null,
          kingLock: null,
          deadlineAt: incoming.deadlineAt ?? trial.deadlineAt,
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
    // The full lock is kept only when it hashes to the king the chain recorded. The name shown
    // for the king never comes from a browser; `nameKing` takes it from the seats.
    const claimed = ccc.Script.from(incoming.kingLock).hash();
    if (next.kingHash && sameHex(claimed, next.kingHash)) next = { ...next, kingLock: incoming.kingLock };
    const checked = await refreshFromChain(next);
    if (checked.seen === 'match') next = checked.room;
  }
  // A room with no match cell has no chain to read, so the clock and the crown live here.
  // Nothing is at stake in that mode — it is the demo floor, not a pot. Only the host may
  // start such a room; a player may move one the host has already started.
  if (!next.matchId && (fromHost || current.status === 'live')) {
    next = {
      ...next,
      status: incoming.status,
      round: incoming.round,
      kingScore: incoming.kingScore,
      potShannons: incoming.potShannons,
      king: incoming.king ?? next.king,
      openedAt: incoming.openedAt ?? next.openedAt,
      deadlineAt: incoming.deadlineAt ?? next.deadlineAt,
      feed: incoming.feed.length ? incoming.feed : next.feed,
      seals: incoming.seals.length ? incoming.seals : next.seals,
    };
  }
  if (opening && next.matchId) {
    next = {
      ...next,
      feed: [
        { id: `${Date.now()}-open`, text: 'Game opened on chain. Entries are open; the clock starts after the countdown.', good: true },
        ...next.feed,
      ].slice(0, 8),
    };
  }
  if (next.matchId) next = await announce(current, next, existing.seats);
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
    else if (seat.bidOutPoint) {
      // A first entry is news for the lobby; a seal only moves the same entry along.
      if (!found.bidOutPoint) {
        const room = roomFromStored(existing.room);
        room.feed = [{ id: `${now}-entry`, text: `${found.displayName} paid an entry.`, good: true }, ...room.feed].slice(0, 8);
        existing.room = roomToStored(room);
      }
      found.bidOutPoint = seat.bidOutPoint;
    }
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
  return { room: publicRoom(await nameFeed(await nameKing(refreshed.room, seats))), seats: await nameSeats(seats) };
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
  await sql`DELETE FROM keepers_crowns WHERE id = ${id}`;
}
