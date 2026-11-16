'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Gem } from 'lucide-react';
import { EASE } from '@/components/crowns/motion';
import { Avatar } from '@/components/ui/Avatar';
import { loadAvatarSpore } from '@/hooks/usePublicProfile';
import { ckbWhole, useLockHashes, useRallyStats } from '@/hooks/useRallyStats';
import { listBuilders } from '@/lib/api/keeperApi';
import { MAP_IMG } from '@/lib/crowns/art';
import { mapName } from '@/lib/rally/rules';
import type { PlayerTally, RaceResult } from '@/lib/rally/stats';
import type { BuilderProfile } from '@/types/builder';

/** Seen this recently counts as online. */
export const ONLINE_MS = 5 * 60_000;

/** Every named player, by wallet lock hash (lower case), so a race's cars can show names and faces. */
export function usePlayerBook() {
  const builders = useQuery({ queryKey: ['builders', 'roster'], queryFn: listBuilders });
  const named = useMemo(() => (builders.data ?? []).filter((player) => player.username), [builders.data]);
  const lockHashes = useLockHashes(named.map((player) => player.address));
  return useMemo(() => {
    const out = new Map<string, BuilderProfile>();
    for (const player of named) {
      const hash = lockHashes.data?.[player.address.toLowerCase()];
      if (hash) out.set(hash, player);
    }
    return out;
  }, [named, lockHashes.data]);
}

/** A player's face: their Spore picture when they set one, else a ready-made face. */
export function PlayerFace({ player, fallback, size = 40, tone = '#262a31' }: { player?: BuilderProfile; fallback: string; size?: number; tone?: string }) {
  const sporeId = player?.avatarSporeId ?? null;
  const picture = useQuery({
    queryKey: ['avatar-spore', sporeId],
    enabled: Boolean(sporeId),
    queryFn: () => loadAvatarSpore(sporeId!),
    staleTime: 60_000,
  });
  const src = !sporeId ? null : picture.isPending ? undefined : (picture.data?.imageUrl ?? null);
  return <Avatar name={player ? `@${player.username}` : fallback} tone={tone} size={size} src={src} />;
}

/** A name to show for a lock hash: the player's @name, or a short hash. */
export function nameFor(book: Map<string, BuilderProfile>, hash: string): string {
  const player = book.get(hash);
  return player ? `@${player.username}` : `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

export function ShardCount({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Gem className="h-[0.8em] w-[0.8em] text-pink" strokeWidth={2.5} aria-hidden="true" />
      {value.toLocaleString('en-US')}
    </span>
  );
}

export function CkbAmount({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={className}>
      {value.toLocaleString('en-US')}
      <span className="ml-1 text-[0.6em] font-bold opacity-70">CKB</span>
    </span>
  );
}

type Board = 'won' | 'shards';
type Ranked = { hash: string; tally: PlayerTally };

function rank(players: Record<string, PlayerTally>, board: Board): Ranked[] {
  return Object.entries(players)
    .map(([hash, tally]) => ({ hash, tally }))
    .filter(({ tally }) => (board === 'won' ? tally.wins > 0 : tally.shards > 0))
    .sort((a, b) =>
      board === 'shards'
        ? b.tally.shards - a.tally.shards
        : BigInt(b.tally.won) > BigInt(a.tally.won)
          ? 1
          : BigInt(b.tally.won) < BigInt(a.tally.won)
            ? -1
            : b.tally.wins - a.tally.wins,
    );
}

/** Who's on top: a CKB-won / shards switch, a podium for the top three and the rest in a list. */
export function LeaderboardBoard({ initial = 'won', limit = 8 }: { initial?: Board; limit?: number }) {
  const [tab, setTab] = useState<Board>(initial);
  const stats = useRallyStats();
  const book = usePlayerBook();
  const ranked = rank(stats.data?.players ?? {}, tab).slice(0, limit);
  const [first, second, third] = ranked;
  const rest = ranked.slice(3);

  return (
    <div>
      <div role="tablist" aria-label="Leaderboard" className="inline-flex rounded-full border border-line bg-ink-2 p-1">
        {(['won', 'shards'] as Board[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`relative h-11 whitespace-nowrap rounded-full px-5 font-display text-lg font-black uppercase tracking-wide transition-colors duration-150 ${
              tab === t ? 'text-ink' : 'text-fog hover:text-chalk'
            }`}
          >
            {tab === t ? <motion.span layoutId="board-tab" transition={{ duration: 0.22, ease: EASE }} className="absolute inset-0 rounded-full bg-lime" /> : null}
            <span className="relative">{t === 'won' ? 'CKB won' : 'Shards'}</span>
          </button>
        ))}
      </div>

      {stats.isLoading ? (
        <div className="mt-10 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-ink-3" />
          ))}
        </div>
      ) : ranked.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-line px-6 py-12 text-center">
          <p className="font-display text-3xl font-black uppercase">{tab === 'won' ? 'Nobody has won yet' : 'No shards yet'}</p>
          <p className="mt-2 text-fog">Race and the board fills up.</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18, ease: EASE }}
          >
            <div className="mt-10 grid grid-cols-3 items-end gap-2 sm:gap-4">
              {second ? <PodiumStep entry={second} place={2} tab={tab} book={book} /> : <span />}
              {first ? <PodiumStep entry={first} place={1} tab={tab} book={book} /> : <span />}
              {third ? <PodiumStep entry={third} place={3} tab={tab} book={book} /> : <span />}
            </div>
            {rest.length > 0 ? (
              <ol className="mt-6 divide-y divide-line border-y border-line">
                {rest.map((entry, i) => {
                  const player = book.get(entry.hash);
                  const row = (
                    <>
                      <span className="w-7 font-display text-2xl font-black tabular-nums text-fog">{i + 4}</span>
                      <PlayerFace player={player} fallback={entry.hash} />
                      <span className="min-w-0 flex-1 truncate font-display text-xl font-extrabold">{nameFor(book, entry.hash)}</span>
                      <span className="font-display text-xl font-black tabular-nums">
                        {tab === 'won' ? <CkbAmount value={ckbWhole(entry.tally.won)} /> : <ShardCount value={entry.tally.shards} />}
                      </span>
                    </>
                  );
                  return (
                    <li key={entry.hash}>
                      {player ? (
                        <Link href={`/profile/${encodeURIComponent(player.address)}`} className="flex items-center gap-4 py-3.5 transition-colors duration-150 hover:text-lime">
                          {row}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-4 py-3.5">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

function PodiumStep({ entry, place, tab, book }: { entry: Ranked; place: 1 | 2 | 3; tab: Board; book: Map<string, BuilderProfile> }) {
  const height = place === 1 ? 'h-36 sm:h-44' : place === 2 ? 'h-24 sm:h-32' : 'h-16 sm:h-24';
  const step = place === 1 ? 'bg-gold text-ink' : place === 2 ? 'bg-chalk/85 text-ink' : 'bg-pink text-ink';
  const ring = place === 1 ? '#e1bf47' : place === 2 ? '#99ee2d' : '#ff56f6';
  const player = book.get(entry.hash);
  const body = (
    <>
      <PlayerFace player={player} fallback={entry.hash} size={place === 1 ? 84 : 64} tone={ring} />
      <p className="mt-3 w-full truncate text-center font-display text-lg font-extrabold sm:text-xl">{nameFor(book, entry.hash)}</p>
      <p className="font-display text-lg font-black tabular-nums sm:text-2xl">
        {tab === 'won' ? <CkbAmount value={ckbWhole(entry.tally.won)} /> : <ShardCount value={entry.tally.shards} />}
      </p>
      <div className={`mt-3 flex w-full items-start justify-center rounded-t-2xl pt-2 ${height} ${step}`}>
        <span className="font-display text-4xl font-black sm:text-6xl">{place}</span>
      </div>
    </>
  );
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE, delay: place === 1 ? 0 : place === 2 ? 0.06 : 0.12 }}
      className="min-w-0"
    >
      {player ? (
        <Link href={`/profile/${encodeURIComponent(player.address)}`} className="flex flex-col items-center">
          {body}
        </Link>
      ) : (
        <div className="flex flex-col items-center">{body}</div>
      )}
    </motion.div>
  );
}

export function ago(ms: number | null): string {
  if (!ms) return '';
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The newest finished races: who won, where, how many cars, the pot and when. Each opens its results. */
export function LatestRaces({ limit = 5, races: given }: { limit?: number; races?: RaceResult[] }) {
  const stats = useRallyStats();
  const book = usePlayerBook();
  const races = (given ?? stats.data?.races ?? []).slice(0, limit);

  if (!given && stats.isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-ink-3" />
        ))}
      </div>
    );
  }
  if (races.length === 0) {
    return <p className="text-fog">No finished races yet. Be the first.</p>;
  }
  return (
    <div>
      <div className="hidden grid-cols-[1.4fr_1.2fr_0.6fr_0.8fr_0.8fr] gap-4 border-b border-line pb-3 sm:grid">
        {['Winner', 'Track', 'Cars', 'Pot', 'When'].map((h) => (
          <p key={h} className={`font-display text-sm font-extrabold uppercase tracking-wider text-fog ${h === 'Pot' || h === 'When' ? 'text-right' : ''}`}>
            {h}
          </p>
        ))}
      </div>
      <ul className="divide-y divide-line">
        {races.map((race) => {
          const winner = race.winners[0]?.owner;
          const label = winner ? nameFor(book, winner) : 'Refunded';
          return (
            <li key={race.txHash}>
              <Link
                href={`/rally/${race.matchId}`}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 py-4 transition-colors duration-150 hover:text-lime sm:grid-cols-[1.4fr_1.2fr_0.6fr_0.8fr_0.8fr]"
              >
                <div className="row-span-2 flex min-w-0 items-center gap-3 sm:row-span-1">
                  <PlayerFace player={winner ? book.get(winner) : undefined} fallback={winner ?? race.txHash} />
                  <span className={`hidden truncate font-display text-xl font-extrabold sm:inline ${winner ? '' : 'text-fog'}`}>{label}</span>
                </div>
                <div className="min-w-0">
                  <p className={`truncate font-display text-xl font-extrabold sm:hidden ${winner ? '' : 'text-fog'}`}>{label}</p>
                  <div className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={MAP_IMG[race.map]} alt="" className="hidden h-9 w-12 rounded-md object-cover sm:block" />
                    <span className="truncate text-fog sm:text-chalk">{mapName(race.map)}</span>
                    <span className="text-fog sm:hidden">· {race.players.length} cars</span>
                  </div>
                </div>
                <span className="hidden text-chalk/80 sm:block">{race.players.length}</span>
                <span className="text-right font-display text-xl font-black text-gold">
                  <CkbAmount value={ckbWhole(race.pot)} />
                </span>
                <span className="col-start-3 text-right text-sm text-fog sm:col-start-auto sm:text-base">{ago(race.endedMs)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
