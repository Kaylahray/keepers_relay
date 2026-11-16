import { ccc } from '@ckb-ccc/connector-react';
import type { RaceResult } from '@/lib/rally/stats';

/**
 * A Crown Rally trophy: a Spore the winner of a race makes for themselves after it's paid. It holds a
 * few bytes about the race, and the app draws the picture from them. Anyone can make a Spore that
 * looks like one, so a trophy only counts when the race it names (its finish transaction) paid the
 * wallet that holds it as a winner. The CKB it holds stays the owner's: melting it gives it back.
 *
 * Content, 45 bytes: `version u8 ‖ finish tx hash 32 ‖ map u8 ‖ cars u8 ‖ finish tick u16 LE ‖ pot u64 LE`.
 */

export const TROPHY_TYPE = 'application/x-crown-rally-trophy';
const VERSION = 1;
const SIZE = 45;

export type Trophy = {
  /** The Spore id. */
  id: string;
  finishTx: string;
  map: number;
  cars: number;
  /** The tick the winner crossed the line on. */
  ticks: number;
  pot: bigint;
};

export function encodeTrophy(trophy: Omit<Trophy, 'id'>): Uint8Array {
  const out = new Uint8Array(SIZE);
  const view = new DataView(out.buffer);
  out[0] = VERSION;
  out.set(ccc.bytesFrom(trophy.finishTx), 1);
  out[33] = trophy.map;
  out[34] = trophy.cars;
  view.setUint16(35, trophy.ticks, true);
  view.setBigUint64(37, trophy.pot, true);
  return out;
}

export function decodeTrophy(id: string, content: ccc.BytesLike): Trophy | null {
  const raw = ccc.bytesFrom(content);
  if (raw.length !== SIZE || raw[0] !== VERSION) return null;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.length);
  return {
    id,
    finishTx: ccc.hexFrom(raw.slice(1, 33)),
    map: raw[33]!,
    cars: raw[34]!,
    ticks: view.getUint16(35, true),
    pot: view.getBigUint64(37, true),
  };
}

/** Every trophy-looking Spore a lock holds, newest first. Check each with `isRealTrophy` before showing it. */
export async function findTrophies(client: ccc.Client, lock: ccc.ScriptLike, limit = 200): Promise<Trophy[]> {
  const found: Trophy[] = [];
  for await (const { spore, sporeData } of ccc.spore.findSpores({ client, lock, clusterId: '', order: 'desc', limit })) {
    if (sporeData.contentType !== TROPHY_TYPE || !spore.cellOutput.type) continue;
    const trophy = decodeTrophy(spore.cellOutput.type.args, sporeData.content);
    if (trophy) found.push(trophy);
  }
  return found;
}

/**
 * The trophies that count: each names a finish that paid `owner` (a lock hash) as a winner and says
 * the same as that race. One per race, however many copies the wallet made.
 */
export function realTrophies(trophies: Trophy[], races: RaceResult[], owner: string): Trophy[] {
  const byTx = new Map(races.map((race) => [race.txHash.toLowerCase(), race]));
  const seen = new Set<string>();
  return trophies.filter((trophy) => {
    const tx = trophy.finishTx.toLowerCase();
    const race = byTx.get(tx);
    if (!race || seen.has(tx)) return false;
    if (!race.winners.some((winner) => winner.owner === owner.toLowerCase())) return false;
    if (race.map !== trophy.map || race.players.length !== trophy.cars || BigInt(race.pot) !== trophy.pot) return false;
    seen.add(tx);
    return true;
  });
}

/** Builds the transaction that makes a trophy in the signer's wallet, and how much CKB it will hold. */
export async function trophyTx(signer: ccc.Signer, trophy: Omit<Trophy, 'id'>): Promise<{ tx: ccc.Transaction; holds: bigint }> {
  const { tx } = await ccc.spore.createSpore({ signer, data: { contentType: TROPHY_TYPE, content: encodeTrophy(trophy) } });
  // The new Spore is the only output with a type script; the rest is change.
  const holds = tx.outputs.find((output) => output.type)?.capacity ?? 0n;
  await tx.completeFeeBy(signer, 2000);
  return { tx, holds };
}
