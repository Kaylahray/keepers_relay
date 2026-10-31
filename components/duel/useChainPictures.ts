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

// Answers already found on this page visit, so a face seen once never shows its loading frame again.
const known = new Map<string, string | null>();

/** Each player's own profile picture, straight from the chain like their name: a URL, null when they have none, undefined while still looking. */
export function useChainPictures(players: (string | null | undefined)[]): (string | null | undefined)[] {
  const key = players.map((who) => who?.toLowerCase() ?? '').join(',');
  const [, setVersion] = useState(0);

  useEffect(() => {
    const wanted = key.split(',').filter((who) => who && !/^0x0+$/.test(who) && !known.has(who));
    if (wanted.length === 0) return;
    let stop = false;
    void (async () => {
      const owners = await profileSpores();
      for (const who of wanted) {
        const hash = await lockHashOf(who);
        const sporeId = hash ? owners.get(hash) : undefined;
        known.set(who, sporeId ? await pictureOf(sporeId) : null);
      }
    })()
      // A failed read shows the drawn faces rather than spinning for ever.
      .catch(() => wanted.forEach((who) => known.has(who) || known.set(who, null)))
      .finally(() => {
        if (!stop) setVersion((v) => v + 1);
      });
    return () => {
      stop = true;
    };
  }, [key]);

  if (!registryConfigured()) return players.map(() => null);
  return players.map((who) => {
    if (!who || /^0x0+$/.test(who)) return null;
    const hit = known.get(who.toLowerCase());
    return hit === undefined ? undefined : hit;
  });
}
