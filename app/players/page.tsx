'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { CkbAmount, ONLINE_MS, PlayerFace, ShardCount } from '@/components/crowns/Board';
import { EASE } from '@/components/crowns/motion';
import { Button } from '@/components/ui/Button';
import { ckbWhole, NO_TALLY, useLockHashes, useRallyStats } from '@/hooks/useRallyStats';
import { listBuilders } from '@/lib/api/keeperApi';
import type { PlayerTally } from '@/lib/rally/stats';
import type { BuilderProfile } from '@/types/builder';

function Label({ children, className = '' }: { children: string; className?: string }) {
  return <p className={`font-display text-sm font-extrabold uppercase tracking-wider text-fog ${className}`}>{children}</p>;
}

export default function PlayersPage() {
  const players = useQuery({
    queryKey: ['builders', 'roster'],
    queryFn: listBuilders,
  });
  const roster = useMemo(() => (players.data ?? []).filter((player) => player.username), [players.data]);
  const stats = useRallyStats();
  const lockHashes = useLockHashes(roster.map((player) => player.address));
  const tallyOf = (address: string): PlayerTally => {
    const hash = lockHashes.data?.[address.toLowerCase()];
    return (hash && stats.data?.players[hash]) || NO_TALLY;
  };
  const [q, setQ] = useState('');
  // Read once per load; a row's dot does not need to tick.
  const [loadedAt] = useState(() => Date.now());
  const isOnline = (player: BuilderProfile) => loadedAt - Date.parse(player.lastSeenAt) < ONLINE_MS;

  const s = q.trim().toLowerCase().replace(/^@/, '');
  const list = roster
    .filter((player) => !s || player.username.toLowerCase().includes(s) || (player.displayName ?? '').toLowerCase().includes(s))
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  const onNow = roster.filter(isOnline).length;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <motion.h1
          initial={{ opacity: 0, x: -32 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="font-display text-[64px] font-black uppercase leading-[0.85] sm:text-[96px]"
        >
          Players
        </motion.h1>
        {roster.length > 0 ? (
          <span className="flex items-center gap-2 pb-2 text-fog">
            <span className={`h-2 w-2 rounded-full ${onNow ? 'bg-lime' : 'bg-fog'}`} /> {onNow} on now
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-fog">Find someone to race. Check the picture and address: some names look alike.</p>

      <label className="mt-8 flex h-16 items-center gap-3 rounded-2xl border-2 border-line bg-ink-2 px-5 transition-colors duration-150 focus-within:border-lime">
        <Search className="h-6 w-6 text-fog" aria-hidden="true" />
        <span className="sr-only">Search players</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search @name"
          className="h-full min-w-0 flex-1 bg-transparent font-display text-2xl font-extrabold outline-none placeholder:text-fog/60"
        />
      </label>

      <div className="mt-8 hidden grid-cols-[1fr_8rem_5rem_5rem_6rem] gap-4 border-b border-line px-2 pb-3 md:grid">
        <Label>Player</Label>
        <Label className="text-right">CKB won</Label>
        <Label className="text-right">Wins</Label>
        <Label className="text-right">Races</Label>
        <Label className="text-right">Shards</Label>
      </div>

      {players.isLoading ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-ink-3" />
          ))}
        </div>
      ) : players.isError ? (
        <p className="mt-6 rounded-2xl bg-danger/10 p-4 text-danger">Players could not load. Refresh to try again.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line md:mt-0">
          <AnimatePresence initial={false}>
            {list.map((player, i) => (
              <motion.li
                key={player.address}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE, delay: Math.min(i, 6) * 0.04 }}
              >
                <PlayerRow player={player} tally={tallyOf(player.address)} online={isOnline(player)} />
              </motion.li>
            ))}
          </AnimatePresence>
          {list.length === 0 ? (
            <li className="py-16 text-center">
              <p className="font-display text-3xl font-black uppercase">{q ? `No one called @${s}` : 'No players yet'}</p>
              <p className="mt-2 text-fog">{q ? 'Check the spelling, or the name is still free.' : 'Claim a @name and you’ll be the first one here.'}</p>
              <Button href="/rally" className="mt-6">
                Host a race
              </Button>
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

function PlayerRow({ player, tally, online }: { player: BuilderProfile; tally: PlayerTally; online: boolean }) {
  const handle = player.username;
  const short = `${player.address.slice(0, 7)}…${player.address.slice(-4)}`;

  return (
    <Link
      href={`/profile/${encodeURIComponent(player.address)}`}
      className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 rounded-2xl px-2 py-4 transition-colors duration-150 hover:bg-ink-2 md:grid-cols-[1fr_8rem_5rem_5rem_6rem]"
    >
      <span className="row-span-2 flex min-w-0 items-center gap-4 md:row-span-1">
        <span className="relative shrink-0">
          <PlayerFace player={player} fallback={handle} size={52} />
          {online ? <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-ink bg-lime" aria-label="Online" /> : null}
        </span>
        <span className="hidden min-w-0 md:block">
          <span className="block truncate font-display text-2xl font-black leading-none">@{handle}</span>
          <span className="font-mono text-sm text-fog">{short}</span>
        </span>
      </span>
      {/* Phone: the name and short stats under it. */}
      <span className="min-w-0 md:hidden">
        <span className="block truncate font-display text-2xl font-black leading-none">@{handle}</span>
        <span className="mt-1 block truncate text-sm text-fog">
          {tally.wins} {tally.wins === 1 ? 'win' : 'wins'} · {tally.played} {tally.played === 1 ? 'race' : 'races'} · <ShardCount value={tally.shards} />
        </span>
      </span>
      <span className="row-span-2 text-right font-display text-xl font-black text-gold md:row-span-1">
        <CkbAmount value={ckbWhole(tally.won)} />
      </span>
      <span className="hidden text-right font-display text-xl font-black md:block">{tally.wins}</span>
      <span className="hidden text-right font-display text-xl font-black text-chalk/80 md:block">{tally.played}</span>
      <span className="hidden items-center justify-end font-display text-xl font-black text-pink md:flex">
        <ShardCount value={tally.shards} />
      </span>
    </Link>
  );
}
