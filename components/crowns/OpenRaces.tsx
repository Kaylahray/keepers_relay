'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Star, Timer } from 'lucide-react';
import { EASE } from '@/components/crowns/motion';
import { getCkbClient } from '@/lib/ckb/client';
import { MAP_IMG } from '@/lib/crowns/art';
import { isSponsored, listMatches, playersOf, potOf, racingSeats, type MatchSnapshot } from '@/lib/rally/chain';
import { lobbyEndsAt } from '@/lib/rally/protocol';
import { mapName } from '@/lib/rally/rules';
import { rallyConfigured } from '@/lib/registry/config';

const CKB = 100_000_000n;

/** The clock, once a second, for countdowns. */
export function useNow(every = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}

/** When a landed match's lobby closes, from its own landing and each seat's. Null while it's still confirming. */
export function lobbyEnd(item: MatchSnapshot): number | null {
  if (!item.landed) return null;
  const seats = racingSeats(item).map((seat) => Number(seat.landed!.landedMs));
  return lobbyEndsAt(Number(item.landed.landedMs), seats, item.match.wait * 1000);
}

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Matches on chain whose lobby is still taking players, soonest to start first. */
export function useOpenRaces() {
  const configured = rallyConfigured();
  const matches = useQuery({
    queryKey: ['matches'],
    queryFn: () => listMatches(getCkbClient()),
    enabled: configured,
    refetchInterval: 10_000,
  });
  const now = useNow();
  const open = (matches.data ?? [])
    .map((item) => ({ item, ends: lobbyEnd(item) }))
    .filter(({ item, ends }) => ends != null && ends > now && playersOf(item).length < item.match.seats)
    // Free races first, then the soonest to start.
    .sort((a, b) => Number(isSponsored(b.item.match)) - Number(isSponsored(a.item.match)) || a.ends! - b.ends!);
  return { configured, matches, open, now };
}

/** One open race: the track, its countdown, the seats filling up, the entry or the prize, and the pot so far. */
export function OpenRaceRow({ item, ends, now, index }: { item: MatchSnapshot; ends: number; now: number; index: number }) {
  const filled = playersOf(item).length;
  const left = ends - now;
  const entry = Number(item.match.entry / CKB);
  const pot = Number(potOf(item.match, filled) / CKB);
  const free = isSponsored(item.match);
  return (
    <motion.li initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE, delay: index * 0.05 }}>
      <Link
        href={`/rally/${item.matchId}`}
        className={`group flex w-full items-stretch gap-4 overflow-hidden rounded-3xl border bg-ink-2 p-2 pr-4 text-left transition-colors duration-150 hover:border-chalk/30 ${free ? 'border-gold/60' : 'border-line'}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MAP_IMG[item.match.map]} alt="" className="w-24 shrink-0 rounded-2xl object-cover sm:w-28" />
        <div className="flex min-w-0 flex-1 flex-col justify-center py-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-display text-2xl font-black uppercase leading-none">{mapName(item.match.map)}</p>
            <span className={`flex items-center gap-1 font-display text-xl font-black tabular-nums ${left < 30_000 ? 'text-pink' : 'text-chalk'}`}>
              <Timer className="h-4 w-4" aria-hidden="true" /> {clock(left)}
            </span>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5" aria-label={`${filled} of ${item.match.seats} seats filled`}>
            {Array.from({ length: item.match.seats }).map((_, i) => (
              <span key={i} className={`h-2 flex-1 rounded-full ${i < filled ? 'bg-lime' : 'bg-ink-3'}`} />
            ))}
            <span className="ml-2 font-display text-lg font-black tabular-nums">
              {filled}/{item.match.seats}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fog">
            {free ? (
              <span className="flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-xs font-black uppercase tracking-wider text-ink">
                <Star className="h-3 w-3" aria-hidden="true" /> Free entry
              </span>
            ) : (
              <span>
                Entry <b className="font-semibold text-chalk">{entry} CKB</b>
              </span>
            )}
            <span>
              {free ? 'Prize' : 'Pot'} <b className="font-semibold text-gold">{pot} CKB</b>
            </span>
          </div>
        </div>
      </Link>
    </motion.li>
  );
}

/** The open races list with its loading and empty states. */
export function OpenRaces({ limit }: { limit?: number }) {
  const { configured, matches, open, now } = useOpenRaces();
  const shown = limit ? open.slice(0, limit) : open;
  if (!configured) return <p className="mt-6 text-gold">Crowns isn’t live on this network yet. Practice is.</p>;
  if (matches.isPending) {
    return (
      <div className="mt-6 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-3xl bg-ink-3" />
        ))}
      </div>
    );
  }
  if (matches.isError) return <p className="mt-6 text-pink">Open races could not load. Refresh to try again.</p>;
  if (shown.length === 0) {
    return (
      <div className="mt-6 rounded-3xl border border-dashed border-line px-6 py-14 text-center">
        <p className="font-display text-3xl font-black uppercase">No open races</p>
        <p className="mt-2 text-fog">Host one and send the link. Others can jump in.</p>
      </div>
    );
  }
  return (
    <ul className="mt-6 space-y-3">
      {shown.map(({ item, ends }, i) => (
        <OpenRaceRow key={item.matchId} item={item} ends={ends!} now={now} index={i} />
      ))}
    </ul>
  );
}
