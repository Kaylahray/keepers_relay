import { ccc } from '@ckb-ccc/core';
import { getServerCkbClient } from '@/lib/ckb/server-client';
import { registryConfigured, usernameType } from '@/lib/registry/config';
import { decodeUsername, isValidUsername } from '@/lib/registry/encoding';
import { normalizeAddress } from '@/lib/server/auth';

/**
 * Every username claimed on chain, by owner address.
 *
 * The username cells are the source of truth for who has a name. The profiles table only adds
 * pictures and bios, and it misses anyone whose claim was never saved there (another device, an
 * older version of the app, a failed save). So the players list and the seat check read names
 * from here.
 *
 * One scan of the registry is shared for 30 seconds; a claim shows up within about that window.
 * After the first scan, readers never wait: an old answer is served while a new scan runs.
 */
const TTL_MS = 30_000;

type Registry = { byAddress: Map<string, string>; byLockHash: Map<string, string> };

let cached: { at: number; task: Promise<Registry> } | null = null;
let refreshing = false;

async function scan(): Promise<Registry> {
  const names = new Map<string, string>();
  const byLockHash = new Map<string, string>();
  if (!registryConfigured()) return { byAddress: names, byLockHash };
  const client = getServerCkbClient();
  const type = ccc.Script.from({
    codeHash: usernameType.codeHash,
    hashType: usernameType.hashType,
    args: usernameType.args,
  });
  for await (const cell of client.findCells({ script: type, scriptType: 'type', scriptSearchMode: 'exact' }, 'asc', 200)) {
    const name = decodeUsername(new Uint8Array(ccc.bytesFrom(cell.outputData)));
    if (!isValidUsername(name)) continue;
    const address = normalizeAddress(ccc.Address.fromScript(cell.cellOutput.lock, client).toString());
    names.set(address, name);
    byLockHash.set(cell.cellOutput.lock.hash().toLowerCase(), name);
  }
  return { byAddress: names, byLockHash };
}

function registry(): Promise<Registry> {
  const fresh = cached && Date.now() - cached.at < TTL_MS;
  if (cached && (fresh || refreshing)) return cached.task;
  if (cached) {
    // Stale: answer with the last scan straight away and refresh behind it, so no request waits
    // on a registry scan once the first one has finished.
    const previous = cached.task;
    refreshing = true;
    const task = scan();
    task
      .then(() => {
        cached = { at: Date.now(), task };
      })
      .catch(() => undefined)
      .finally(() => {
        refreshing = false;
      });
    return previous;
  }
  const task = scan();
  cached = { at: Date.now(), task };
  // A failed first scan must not stick for the whole window.
  task.catch(() => {
    if (cached?.task === task) cached = null;
  });
  return task;
}

export async function chainUsernames(): Promise<Map<string, string>> {
  return (await registry()).byAddress;
}

/** The username of whoever owns a lock hash, such as the king a match cell records. */
export async function chainUsernameOfLockHash(lockHash: string): Promise<string | null> {
  return (await registry()).byLockHash.get(lockHash.toLowerCase()) ?? null;
}

/** The on-chain username for one address, or null. */
export async function chainUsernameOf(address: string): Promise<string | null> {
  return (await chainUsernames()).get(normalizeAddress(address)) ?? null;
}
