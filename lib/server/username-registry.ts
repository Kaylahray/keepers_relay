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
 * One scan of the registry is shared for 30 seconds; a claim shows up within that window.
 */
const TTL_MS = 30_000;

let cached: { at: number; task: Promise<Map<string, string>> } | null = null;

async function scan(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!registryConfigured()) return names;
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
  }
  return names;
}

export function chainUsernames(): Promise<Map<string, string>> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.task;
  const task = scan();
  cached = { at: Date.now(), task };
  // A failed scan must not stick for the whole window.
  task.catch(() => {
    if (cached?.task === task) cached = null;
  });
  return task;
}

/** The on-chain username for one address, or null. */
export async function chainUsernameOf(address: string): Promise<string | null> {
  return (await chainUsernames()).get(normalizeAddress(address)) ?? null;
}
