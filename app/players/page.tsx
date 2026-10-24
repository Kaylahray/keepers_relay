'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { loadAvatarSpore } from '@/hooks/usePublicProfile';
import { listBuilders } from '@/lib/api/keeperApi';
import type { BuilderProfile } from '@/types/builder';

export default function PlayersPage() {
  const players = useQuery({
    queryKey: ['builders', 'roster'],
    queryFn: listBuilders,
  });

  return (
    <ArenaStage backHref="/play" backLabel="Crowns">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
        Players
      </p>
      <h1 className="mt-2 font-poster text-5xl uppercase leading-none text-white">Who is here</h1>
      <p className="mt-3 max-w-xl text-sm text-white/60">
        Challenge a player by hosting a crown.
      </p>
      {players.isLoading ? (
        <p className="mt-8 font-mono text-xs uppercase text-white/40">Loading players…</p>
      ) : (players.data ?? []).length === 0 ? (
        <p className="mt-8 text-sm text-white/55">No one has a profile yet.</p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortPlayers(players.data ?? []).map((player) => (
            <PlayerCard
              key={player.address}
              address={player.address}
              name={player.displayName || player.username}
              sporeId={player.avatarSporeId}
            />
          ))}
        </ul>
      )}
    </ArenaStage>
  );
}

/** Only players who claimed a username are listed, most recently seen first. */
function sortPlayers(list: BuilderProfile[]): BuilderProfile[] {
  return list.filter((player) => player.username).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

function PlayerCard({
  address,
  name,
  sporeId,
}: {
  address: string;
  name: string;
  sporeId: string | null;
}) {
  const avatar = useQuery({
    queryKey: ['avatar-spore', sporeId],
    enabled: Boolean(sporeId),
    queryFn: () => loadAvatarSpore(sporeId!),
  });
  const short = `${address.slice(0, 8)}…${address.slice(-6)}`;

  return (
    <li className="border border-white/10 bg-black/40 p-4">
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 overflow-hidden border border-white/10 bg-black">
          {avatar.data?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar.data.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="truncate font-poster text-2xl uppercase text-white">{name}</p>
          <p className="truncate font-mono text-[10px] text-white/40">{short}</p>
        </div>
      </div>
      <Link
        href={`/create?duel=${encodeURIComponent(address)}`}
        className="mt-4 inline-flex border border-[#99ee2d] px-3 py-2 font-mono text-[11px] font-bold uppercase text-[#99ee2d]"
      >
        Challenge
      </Link>
    </li>
  );
}
