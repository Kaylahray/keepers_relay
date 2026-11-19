import { getServerCkbClient } from '@/lib/ckb/server-client';
import { findMatch, matchEnding, racingSeats } from '@/lib/rally/chain';
import { doorsOpen, lobbyEndsAt } from '@/lib/rally/protocol';
import { mapName } from '@/lib/rally/rules';
import { raceOf } from '@/lib/rally/stats';
import { chainUsernameOfLockHash } from '@/lib/server/username-registry';

const CKB = 100_000_000n;

export type RacePreview = {
  map: number;
  track: string;
  /** "Open", "Starting" or "Finished": part of the image address, so each stage gets a fresh image. */
  stage: 'open' | 'starting' | 'finished';
  headline: string;
  description: string;
  stats: { label: string; value: string }[];
  host: string | null;
};

/** Chat apps give up on slow previews, so a name lookup gets two seconds at most. */
function nameOf(lockHash: string): Promise<string | null> {
  return Promise.race([
    chainUsernameOfLockHash(lockHash).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_000)),
  ]);
}

function whole(shannons: bigint): string {
  return (Number(shannons) / Number(CKB)).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function minutes(ms: number): string {
  const left = Math.max(1, Math.ceil(ms / 60_000));
  return left < 60 ? `${left} min` : `${Math.floor(left / 60)} h ${left % 60} min`;
}

/** What a shared race link says about itself, read from the chain: the lobby while it is open, the winner once it has finished. */
export async function racePreview(id: string): Promise<RacePreview | null> {
  if (!/^0x[0-9a-f]{64}$/i.test(id)) return null;
  const client = getServerCkbClient();
  const snapshot = await findMatch(client, id).catch(() => null);

  if (snapshot) {
    const { match } = snapshot;
    const players = 1 + racingSeats(snapshot).length;
    const host = await nameOf(match.host);
    const ends = snapshot.landed
      ? lobbyEndsAt(Number(snapshot.landed.landedMs), racingSeats(snapshot).map((seat) => Number(seat.landed!.landedMs)), match.wait * 1000)
      : null;
    const open = players < match.seats && (ends == null || doorsOpen(ends, Date.now()));
    const by = host ? ` Hosted by @${host}.` : '';
    return {
      map: match.map,
      track: mapName(match.map),
      stage: open ? 'open' : 'starting',
      headline: open ? `Race me for ${whole(match.entry * BigInt(players + 1))} CKB` : 'This race is about to start',
      description: open
        ? `${mapName(match.map)} · ${whole(match.entry)} CKB entry · ${players}/${match.seats} seats taken.${by} Winner takes the pot.`
        : `${mapName(match.map)} · ${players} cars · ${whole(match.entry * BigInt(players))} CKB pot. Watch it live.`,
      stats: [
        { label: 'Entry', value: `${whole(match.entry)} CKB` },
        { label: 'Seats', value: `${players}/${match.seats}` },
        { label: open ? 'Starts in' : 'Pot', value: open && ends != null ? minutes(ends - Date.now()) : `${whole(match.entry * BigInt(players))} CKB` },
      ],
      host,
    };
  }

  const ending = await matchEnding(client, id).catch(() => null);
  const race = ending ? await raceOf(client, ending.txHash).catch(() => null) : null;
  if (!race) return null;
  const winner = race.winners[0];
  const [host, champ] = await Promise.all([nameOf(race.players[0]!), winner ? nameOf(winner.owner) : null]);
  const champName = champ ? `@${champ}` : 'The winner';
  const pot = whole(BigInt(race.pot));
  return {
    map: race.map,
    track: mapName(race.map),
    stage: 'finished',
    headline: winner ? `${champName} won ${whole(BigInt(winner.share))} CKB` : 'Nobody finished: every entry went home',
    description: `${mapName(race.map)} · ${race.players.length} cars · ${pot} CKB pot. The chain replayed the race and paid out.`,
    stats: [
      { label: 'Pot', value: `${pot} CKB` },
      { label: 'Cars', value: String(race.players.length) },
      { label: 'Result', value: winner ? 'Paid' : 'Refunded' },
    ],
    host,
  };
}
