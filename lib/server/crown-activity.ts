import { ccc } from '@ckb-ccc/core';
import { getServerCkbClient } from '@/lib/ckb/server-client';
import { chainUsernameOfLockHash } from '@/lib/server/username-registry';
import { suddenDeathBidType, suddenDeathMatchType } from '@/lib/registry/config';
import { bytesToHex, decodeBidData, decodeEntryRun, decodeMatchCell, hexToBytes } from '@/lib/sudden-death/codec';
import type { CrownFeedItem, CrownRoom } from '@/lib/crown/rooms';
import type { CrownSeat } from '@/lib/crown/seats';

/** A crown's activity, read back from its transactions on chain, so no entry or take can be missing from the list. */

type Event =
  | { kind: 'open' }
  | { kind: 'entry'; owner: string }
  | { kind: 'take'; round: number; king: string; score: number; pot: bigint };

/** `keepsMatch`: the transaction writes the crown's cell again. A match transaction that doesn't is the close. */
type Placed = { txHash: string; block: bigint; index: bigint; at: number; keepsMatch: boolean; events: Event[] };

// A committed transaction never changes, so each one is read once per server.
const readTxs = new Map<string, Placed>();
const blockTimes = new Map<bigint, number>();
// Pages poll, so a crown's list is rebuilt at most this often.
const REBUILD_MS = 8_000;
const built = new Map<string, { at: number; items: CrownFeedItem[] }>();
const building = new Map<string, Promise<CrownFeedItem[] | null>>();

function matchScript(room: CrownRoom): ccc.Script | null {
  if (!room.matchId || !room.hostLockHash || suddenDeathMatchType.codeHash.length <= 2) return null;
  return ccc.Script.from({
    codeHash: suddenDeathMatchType.codeHash,
    hashType: suddenDeathMatchType.hashType,
    args: `0x${room.matchId.replace(/^0x/, '')}${room.hostLockHash.replace(/^0x/, '')}`,
  });
}

async function blockTime(client: ccc.Client, block: bigint): Promise<number> {
  const known = blockTimes.get(block);
  if (known != null) return known;
  const header = await client.getHeaderByNumber(block);
  const at = header ? Number(header.timestamp) : Date.now();
  if (header) blockTimes.set(block, at);
  return at;
}

/** What one transaction did to the crown: opened it, took it, or paid an entry. */
function eventsOf(tx: ccc.Transaction, matchHash: string, matchOut: number): Event[] {
  const events: Event[] = [];
  tx.outputs.forEach((output, index) => {
    const type = output.type;
    if (!type || type.codeHash !== suddenDeathBidType.codeHash) return;
    const args = ccc.bytesFrom(type.args);
    if (args.length !== 64 || bytesToHex(args.slice(0, 32)).toLowerCase() !== matchHash) return;
    const data = hexToBytes(tx.outputsData[index] ?? '0x');
    // A new entry has no laps yet. Each lap locked into it makes another bid cell with more laps.
    if (decodeEntryRun(data).laps !== 0) return;
    try {
      events.push({ kind: 'entry', owner: decodeBidData(data).owner.hash().toLowerCase() });
    } catch {
      // Not an entry this app wrote.
    }
  });
  if (matchOut >= 0) {
    try {
      const cell = decodeMatchCell(hexToBytes(tx.outputsData[matchOut] ?? '0x'));
      if (cell.king.every((byte) => byte === 0)) events.push({ kind: 'open' });
      else events.push({ kind: 'take', round: cell.round, king: bytesToHex(cell.king).toLowerCase(), score: Number(cell.kingScore), pot: cell.pot });
    } catch {
      // An older match cell this page can't read.
    }
  }
  return events;
}

// Transactions read from the node at once. One at a time, a busy crown took half a minute.
const PARALLEL = 12;

async function readPlaced(client: ccc.Client, item: { txHash: ccc.Hex; blockNumber: ccc.Num; txIndex: ccc.Num }, matchHash: string): Promise<Placed | null> {
  const cached = readTxs.get(item.txHash);
  if (cached) return cached;
  const response = await client.getTransaction(item.txHash);
  if (!response?.transaction || response.status !== 'committed') return null;
  const tx = response.transaction;
  const matchOut = tx.outputs.findIndex((output) => output.type?.hash().toLowerCase() === matchHash);
  const placed: Placed = {
    txHash: item.txHash,
    block: ccc.numFrom(item.blockNumber),
    index: ccc.numFrom(item.txIndex),
    at: await blockTime(client, ccc.numFrom(item.blockNumber)),
    keepsMatch: matchOut >= 0,
    events: eventsOf(tx, matchHash, matchOut),
  };
  readTxs.set(item.txHash, placed);
  return placed;
}

async function placedTxs(client: ccc.Client, script: ccc.Script, mode: 'exact' | 'prefix', matchHash: string): Promise<Placed[]> {
  const items = [];
  for await (const item of client.findTransactions({ script, scriptType: 'type', scriptSearchMode: mode, groupByTransaction: true }, 'asc', 100)) {
    items.push(item);
  }
  const out: Placed[] = [];
  for (let start = 0; start < items.length; start += PARALLEL) {
    const batch = await Promise.all(items.slice(start, start + PARALLEL).map((item) => readPlaced(client, item, matchHash)));
    for (const placed of batch) if (placed) out.push(placed);
  }
  return out;
}

function namer(seats: CrownSeat[]) {
  const names = new Map<string, string>();
  return async (lockHash: string): Promise<string> => {
    const known = names.get(lockHash);
    if (known) return known;
    let name = await chainUsernameOfLockHash(lockHash).catch(() => null);
    for (const seat of name ? [] : seats) {
      const hash = await ccc.Address.fromString(seat.address, getServerCkbClient())
        .then((address) => address.script.hash().toLowerCase())
        .catch(() => null);
      if (hash === lockHash) {
        name = seat.displayName;
        break;
      }
    }
    name ??= `${lockHash.slice(0, 10)}…${lockHash.slice(-4)}`;
    names.set(lockHash, name);
    return name;
  };
}

/** Newest first, the way the page shows it. Null when the crown has nothing on chain or the chain can't be read. */
export async function chainActivity(room: CrownRoom, seats: CrownSeat[]): Promise<CrownFeedItem[] | null> {
  const script = matchScript(room);
  if (!script) return null;
  const cached = built.get(room.id);
  if (cached && Date.now() - cached.at < REBUILD_MS) return cached.items;
  // Pages that ask while a rebuild is running share it.
  const running = building.get(room.id);
  if (running) return running;
  const task = rebuild(room, seats, script, cached?.items ?? null).finally(() => building.delete(room.id));
  building.set(room.id, task);
  return task;
}

async function rebuild(room: CrownRoom, seats: CrownSeat[], script: ccc.Script, previous: CrownFeedItem[] | null): Promise<CrownFeedItem[] | null> {
  try {
    const client = getServerCkbClient();
    const matchHash = script.hash().toLowerCase();
    const bidScript = ccc.Script.from({ codeHash: suddenDeathBidType.codeHash, hashType: suddenDeathBidType.hashType, args: matchHash });
    const [matchTxs, bidTxs] = await Promise.all([placedTxs(client, script, 'exact', matchHash), placedTxs(client, bidScript, 'prefix', matchHash)]);
    const closes = new Set(matchTxs.filter((placed) => !placed.keepsMatch).map((placed) => placed.txHash));
    const byHash = new Map<string, Placed>();
    for (const placed of [...matchTxs, ...bidTxs]) byHash.set(placed.txHash, placed);
    const ordered = [...byHash.values()].sort((a, b) => (a.block === b.block ? Number(a.index - b.index) : a.block < b.block ? -1 : 1));

    const nameOf = namer(seats);
    const items: CrownFeedItem[] = [];
    let king: string | null = null;
    let pot = 0n;
    let round = 0;
    for (const placed of ordered) {
      for (const [n, event] of placed.events.entries()) {
        const id = `${placed.at}-${placed.txHash.slice(2, 10)}-${n}`;
        if (event.kind === 'open') {
          items.push({ id, text: 'Game opened on chain. Entries open and the clock starts when the countdown ends.', good: true });
        } else if (event.kind === 'entry') {
          items.push({ id, text: `${await nameOf(event.owner)} paid an entry.`, good: true });
        } else if (event.kind === 'take') {
          // Only a new round is a take; anything else that rewrites the cell keeps the same crown.
          if (event.round <= round) continue;
          round = event.round;
          king = event.king;
          pot = event.pot;
          items.push({ id, text: `${await nameOf(event.king)} took the crown with ${event.score} · pot ${Number(event.pot) / 100_000_000} CKB`, good: true });
        }
      }
      if (closes.has(placed.txHash)) {
        items.push({
          id: `${placed.at}-${placed.txHash.slice(2, 10)}-close`,
          text: king ? `Crown closed. ${await nameOf(king)} won the ${Number(pot) / 100_000_000} CKB pot.` : 'Crown closed. Nobody took it, so every entry was paid back.',
          good: Boolean(king),
        });
      }
    }
    items.reverse();
    built.set(room.id, { at: Date.now(), items });
    return items;
  } catch {
    return previous;
  }
}
