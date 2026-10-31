'use client';

import { useEffect, useState } from 'react';
import { ccc } from '@ckb-ccc/connector-react';
import { loadAvatarSpore } from '@/hooks/usePublicProfile';
import { getClient } from '@/lib/registry/client';
import { registryConfigured } from '@/lib/registry/config';
import { decodeProfile } from '@/lib/registry/encoding';
import { getProfileTypeScript } from '@/lib/registry/scripts';

/** How long one read of every profile on chain is reused before it is read again. */
const PROFILES_FRESH_MS = 60_000;

// One read of the profile cells serves every face on the page, and each picture is fetched once.
let profiles: { at: number; owners: Promise<Map<string, string>> } | null = null;
const pictures = new Map<string, Promise<string | null>>();
const lockHashes = new Map<string, Promise<string | null>>();

/** Every profile's chosen Spore, by the owner's lock hash. */
function profileSpores(): Promise<Map<string, string>> {
  if (profiles && Date.now() - profiles.at < PROFILES_FRESH_MS) return profiles.owners;
  const owners = (async () => {
    const sporeOf = new Map<string, string>();
    for await (const cell of getClient().findCells({ script: getProfileTypeScript(), scriptType: 'type', scriptSearchMode: 'exact' }, 'asc', 500)) {
      const sporeId = decodeProfile(new Uint8Array(ccc.bytesFrom(cell.outputData)))?.avatarSporeId;
      // Later cells are newer edits of the profile, so the last one wins.
      if (sporeId) sporeOf.set(cell.cellOutput.lock.hash().toLowerCase(), sporeId);
    }
    return sporeOf;
  })();
  owners.catch(() => {
    profiles = null;
  });
  profiles = { at: Date.now(), owners };
  return owners;
}

function pictureOf(sporeId: string): Promise<string | null> {
  let found = pictures.get(sporeId);
  if (!found) {
    found = loadAvatarSpore(sporeId).then((avatar) => avatar?.imageUrl ?? null);
    pictures.set(sporeId, found);
  }
  return found;
}

/** A player as a lock hash: given as one already, or as their CKB address. */
function lockHashOf(who: string): Promise<string | null> {
  const key = who.toLowerCase();
  if (/^0x[0-9a-f]{64}$/.test(key)) return Promise.resolve(key);
  let found = lockHashes.get(key);
  if (!found) {
    found = ccc.Address.fromString(who, getClient())
      .then((address) => address.script.hash().toLowerCase())
      .catch(() => null);
    lockHashes.set(key, found);
  }
  return found;
}

/**
 * Each player's own profile picture, straight from the chain like their name: their on-chain
 * profile names a Spore, and the Spore holds the image. Players are given by lock hash or by CKB
 * address. Null for a player without one, who keeps their drawn face.
 */
export function useChainPictures(players: (string | null | undefined)[]): (string | null)[] {
  const key = players.map((who) => who?.toLowerCase() ?? '').join(',');
  const [found, setFound] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const wanted = key.split(',').filter((who) => who && !/^0x0+$/.test(who));
    if (wanted.length === 0 || !registryConfigured()) return;
    let stop = false;
    void (async () => {
      const owners = await profileSpores();
      const next = new Map<string, string>();
      for (const who of wanted) {
        const hash = await lockHashOf(who);
        const sporeId = hash ? owners.get(hash) : undefined;
        const url = sporeId ? await pictureOf(sporeId) : null;
        if (url) next.set(who, url);
      }
      if (!stop) setFound(next);
    })().catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [key]);

  return players.map((who) => (who ? (found.get(who.toLowerCase()) ?? null) : null));
}
