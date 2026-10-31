'use client';

import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { ChainLoader } from '@/components/arena/ChainLoader';
import { Avatar } from '@/components/duel/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState, Tabs } from '@/components/ui/kit';
import { loadAvatarSpore } from '@/hooks/usePublicProfile';
import { getPlayerStats, listBuilders } from '@/lib/api/keeperApi';
import type { BuilderProfile } from '@/types/builder';

type Sort = 'wins' | 'won';
/** Seen this recently counts as online. */
const ONLINE_MS = 5 * 60_000;

export default function PlayersPage() {
  const players = useQuery({
    queryKey: ['builders', 'roster'],
    queryFn: listBuilders,
  });
  const roster = useMemo(() => (players.data ?? []).filter((player) => player.username), [players.data]);
  // Each player's wins and winnings, the same numbers their profile shows.
  const stats = useQueries({
    queries: roster.map((player) => ({
      queryKey: ['player-stats', player.address.toLowerCase()],
      queryFn: () => getPlayerStats(player.address),
      staleTime: 30_000,
    })),
  });
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('wins');
  // Read once per load; a row's dot does not need to tick.
  const [loadedAt] = useState(() => Date.now());

  const rows = roster.map((player, i) => {
    const s = stats[i]?.data;
    return { player, wins: s?.wins ?? null, won: s ? Number(BigInt(s.wonShannons) / 100_000_000n) : null };
  });
  const s = q.trim().toLowerCase().replace(/^@/, '');
  const list = rows
    .filter(({ player }) => !s || player.username.toLowerCase().includes(s) || (player.displayName ?? '').toLowerCase().includes(s))
    .sort((a, b) => (sort === 'wins' ? (b.wins ?? -1) - (a.wins ?? -1) : (b.won ?? -1) - (a.won ?? -1)) || b.player.lastSeenAt.localeCompare(a.player.lastSeenAt));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 md:px-8 md:pt-12">
      <h1 className="font-poster text-3xl font-black uppercase md:text-5xl">Players</h1>
      <p className="mt-2 text-mute">Find someone to challenge. Check the picture and address: some names look alike.</p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-mute" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by @name"
            aria-label="Search players"
            className="h-12 w-full rounded-xl bg-ink-2 pl-12 pr-4 text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/40"
          />
        </div>
        <Tabs
          label="Sort players"
          value={sort}
          onChange={setSort}
          options={[
            { id: 'wins', label: 'Most wins' },
            { id: 'won', label: 'Most CKB won' },
          ]}
        />
      </div>

      <div className="mt-6">
        {players.isLoading ? (
          <ChainLoader compact title="Loading players…" />
        ) : players.isError ? (
          <p className="rounded-xl bg-danger/10 p-4 text-sm text-danger">Could not load the players. Refresh to try again.</p>
        ) : list.length === 0 ? (
          <EmptyState
            title={q ? 'No one by that name' : 'No players yet'}
            body={q ? `Nobody matches “${q}”. Check the spelling, or send an open challenge anyone can take.` : 'Claim a username and you’ll be the first one here.'}
            action={
              <Button href="/duels/new" variant="pink">
                Open challenge
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {list.map((row, i) => (
              <PlayerRow key={row.player.address} rank={i + 1} player={row.player} wins={row.wins} won={row.won} online={loadedAt - Date.parse(row.player.lastSeenAt) < ONLINE_MS} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PlayerRow({ rank, player, wins, won, online }: { rank: number; player: BuilderProfile; wins: number | null; won: number | null; online: boolean }) {
  const avatar = useQuery({
    queryKey: ['avatar-spore', player.avatarSporeId],
    enabled: Boolean(player.avatarSporeId),
    queryFn: () => loadAvatarSpore(player.avatarSporeId!),
  });
  const handle = player.username;
  const name = player.displayName || handle;
  const short = `${player.address.slice(0, 7)}…${player.address.slice(-4)}`;

  return (
    <li className="flex items-center gap-3 rounded-2xl bg-ink-2 p-3 transition-colors duration-150 hover:bg-ink-3 md:gap-5 md:px-5">
      <span className="hidden w-6 text-center font-mono text-sm text-mute md:block">{rank}</span>
      <Link href={`/profile/${encodeURIComponent(player.address)}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
        <span className="relative shrink-0">
          <Avatar name={`@${handle}`} tone="#ff56f6" size={56} src={avatar.data?.imageUrl ?? null} />
          {online ? <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-ink-2 bg-lime" aria-label="Online" /> : null}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">@{handle}</span>
          <span className="block truncate text-xs text-mute">
            {name !== handle ? `${name} · ` : ''}
            <span className="font-mono">{short}</span>
          </span>
        </span>
      </Link>
      <div className="hidden w-20 text-right sm:block">
        <p className="font-poster text-base font-bold tabular-nums">{wins ?? '…'}</p>
        <p className="text-[11px] text-mute">wins</p>
      </div>
      <div className="hidden w-28 text-right sm:block">
        <p className="font-poster text-base font-bold tabular-nums text-gold">{won == null ? '…' : won.toLocaleString('en-US')}</p>
        <p className="text-[11px] text-mute">CKB won</p>
      </div>
      <Button href={`/duels/new?vs=${encodeURIComponent(player.address)}`} variant="pink" size="sm">
        Challenge
      </Button>
    </li>
  );
}
