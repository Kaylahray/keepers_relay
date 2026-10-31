import { ccc } from '@ckb-ccc/core';
import { registryConfigured, usernameType } from '@/lib/registry/config';
import { decodeUsername, isValidUsername } from '@/lib/registry/encoding';

/**
 * Usernames by owner lock hash, read straight from the username cells on chain. Pages that promise
 * not to ask our server (/verify, duels) name players with this.
 */
export async function chainNames(client: ccc.Client, lockHashes: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const wanted = new Set(lockHashes.map((hash) => hash.toLowerCase()));
  if (!registryConfigured() || wanted.size === 0) return names;
  const type = ccc.Script.from({ codeHash: usernameType.codeHash, hashType: usernameType.hashType, args: usernameType.args });
  for await (const cell of client.findCells({ script: type, scriptType: 'type', scriptSearchMode: 'exact' }, 'asc', 200)) {
    const hash = cell.cellOutput.lock.hash().toLowerCase();
    if (!wanted.has(hash)) continue;
    const name = decodeUsername(new Uint8Array(ccc.bytesFrom(cell.outputData)));
    if (isValidUsername(name)) names.set(hash, name);
  }
  return names;
}

/** A player as a reader knows them: their on-chain username, or else the start of their lock hash. */
export function nameOf(names: Map<string, string>, lockHash: string): string {
  const name = names.get(lockHash.toLowerCase());
  return name ? `@${name}` : `${lockHash.slice(0, 8)}…${lockHash.slice(-4)}`;
}
