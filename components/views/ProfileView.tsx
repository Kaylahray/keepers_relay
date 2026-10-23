'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Coins, Crown, Loader2, Pencil, Swords, Trophy, UsersRound, WalletMinimal } from 'lucide-react';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { CharacterAvatar } from '@/components/CharacterPicker';
import { builderKeys } from '@/hooks/useBuilder';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';
import { useAuth } from '@/context/auth-provider';
import { loadAvatarSpore } from '@/hooks/usePublicProfile';
import { getBuilder, getPlayerStats } from '@/lib/api/keeperApi';
import { ckbWhole, GAMES } from '@/lib/crown/rooms';
import type { PlayerCrown } from '@/lib/server/crown-history';

/** A player's profile: who they are, and what they have done in crowns. `me` is the connected wallet. */
export function ProfileView({ address }: { address: string }) {
  const { isConnected, address: walletAddress, isReady } = useWallet();
  const { ensureAuth } = useAuth();
  const { username: onChainUsername } = useUsername();

  const wallet = walletAddress?.toLowerCase() ?? '';
  const target = address === 'me' ? wallet : decodeURIComponent(address).toLowerCase();
  const isSelf = Boolean(wallet && target === wallet);

  const builder = useQuery({
    queryKey: builderKeys.one(target || 'anon'),
    queryFn: () => getBuilder(target),
    enabled: Boolean(target),
    staleTime: 5_000,
  });
  const stats = useQuery({
    queryKey: ['player-stats', target],
    queryFn: () => getPlayerStats(target),
    enabled: Boolean(target),
    staleTime: 15_000,
  });
  const profile = builder.data?.builder ?? null;
  const avatar = useQuery({
    queryKey: ['avatar-spore', profile?.avatarSporeId],
    enabled: Boolean(profile?.avatarSporeId),
    queryFn: () => loadAvatarSpore(profile!.avatarSporeId!),
  });

  if (!isReady) {
    return (
      <ArenaStage backHref="/" backLabel="Home">
        <Loader2 className="h-6 w-6 animate-spin text-[#99ee2d]" />
      </ArenaStage>
    );
  }

  if (address === 'me' && !isConnected) {
    return (
      <ArenaStage backHref="/" backLabel="Home">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
          Profile
        </p>
        <h1 className="mt-3 font-poster text-4xl uppercase text-white">Connect to view</h1>
        <p className="mt-3 max-w-md text-sm text-white/55">
          Your profile and avatar are tied to your wallet.
        </p>
        <ArenaCta onClick={() => void ensureAuth().catch(() => undefined)} className="mt-6">
          <WalletMinimal className="h-4 w-4" />
          Connect wallet
        </ArenaCta>
      </ArenaStage>
    );
  }

  const handle = profile?.username || (isSelf ? onChainUsername?.username : null) || null;
  const displayName = profile?.displayName || handle || (isSelf ? 'You' : `${target.slice(0, 10)}…`);
  const s = stats.data;
  const tile = (value: number | string | null | undefined) =>
    stats.isLoading ? '…' : value == null ? '—' : String(value);

  return (
    <ArenaStage backHref="/" backLabel="Home">
      <section className="grid items-start gap-8 lg:grid-cols-[minmax(220px,280px)_1fr] lg:gap-10">
        <div className="relative z-10">
          <div className="aspect-square w-full max-w-[280px] overflow-hidden border border-white/10 bg-black/50">
            {avatar.data?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar.data.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : profile?.characterId ? (
              <div className="flex h-full items-center justify-center bg-gradient-to-b from-[#a855f7]/30 to-transparent p-6">
                <CharacterAvatar characterId={profile.characterId} size="xl" />
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-white/40">
                <UsersRound className="h-10 w-10" />
                <span className="font-mono text-[10px] uppercase">No avatar yet</span>
              </div>
            )}
          </div>
          {isSelf ? (
            <ArenaCta href="/profile/edit" className="mt-4 w-full justify-center text-center">
              <Pencil className="h-4 w-4" />
              Edit profile
            </ArenaCta>
          ) : null}
        </div>

        <div className="relative z-10 min-w-0">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
            Profile
          </p>
          <h1 className="mt-3 font-poster text-[clamp(2.5rem,5vw,3.75rem)] uppercase leading-[0.92] text-white">
            {displayName}
          </h1>
          {handle ? (
            <p className="mt-2 font-mono text-sm font-bold text-[#99ee2d]">@{handle}</p>
          ) : isSelf ? (
            <p className="mt-2 text-sm text-white/50">No @handle yet.</p>
          ) : null}
          {profile?.headline ? (
            <p className="mt-4 max-w-lg text-base font-light leading-relaxed text-white/60">
              {profile.headline}
            </p>
          ) : isSelf ? (
            <p className="mt-4 max-w-lg text-sm font-light text-white/45">Add a bio in Edit profile.</p>
          ) : null}

          <p className="mt-4 flex flex-wrap items-center gap-2 break-all font-mono text-[10px] text-white/40">
            <WalletMinimal className="h-3.5 w-3.5 shrink-0" />
            {target.slice(0, 12)}…{target.slice(-8)}
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile icon={<Trophy className="h-4 w-4" />} value={tile(s?.wins)} label="Wins" />
            <StatTile
              icon={<Coins className="h-4 w-4" />}
              value={tile(s ? ckbWhole(BigInt(s.wonShannons)) : null)}
              label="CKB won"
            />
            <StatTile icon={<Swords className="h-4 w-4" />} value={tile(s?.crownsTaken)} label="Crowns taken" />
            <StatTile icon={<Crown className="h-4 w-4" />} value={tile(s?.bestScore)} label="Best score" />
          </div>
          {s && (s.holding > 0 || s.hosted > 0) ? (
            <p className="mt-3 font-mono text-[10px] uppercase text-white/45">
              {s.holding > 0 ? `Holding ${s.holding} now` : null}
              {s.holding > 0 && s.hosted > 0 ? ' · ' : null}
              {s.hosted > 0 ? `Hosted ${s.hosted}` : null}
            </p>
          ) : null}
          {stats.isError ? (
            <p className="mt-3 text-sm text-[#ff8b98]">Stats could not load. Refresh to try again.</p>
          ) : null}
        </div>
      </section>

      <section className="relative z-10 mt-12">
        <h2 className="font-poster text-2xl uppercase text-white sm:text-3xl">
          {isSelf ? 'Your crowns' : 'Crowns'}
        </h2>
        {stats.isLoading ? (
          <p className="mt-4 font-mono text-xs uppercase text-white/40">Loading crowns…</p>
        ) : (s?.crowns ?? []).length === 0 ? (
          <p className="mt-3 max-w-lg text-sm text-white/55">
            {isSelf ? 'None yet.' : 'No crowns played yet.'}
          </p>
        ) : (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {s!.crowns.map((crown) => (
              <CrownRow key={crown.id} crown={crown} />
            ))}
          </ul>
        )}
        {isSelf ? (
          <ArenaCta href="/create" className="mt-5">
            Open a crown
          </ArenaCta>
        ) : null}
      </section>
    </ArenaStage>
  );
}

function CrownRow({ crown }: { crown: PlayerCrown }) {
  const won = crown.holds && crown.status === 'settled';
  const badge = won
    ? { text: 'Won', className: 'bg-[#e1bf47] text-[#111]' }
    : crown.holds
      ? { text: 'Holding', className: 'bg-[#99ee2d] text-[#111]' }
      : crown.status === 'live'
        ? { text: 'Live', className: 'border border-[#99ee2d] text-[#99ee2d]' }
        : crown.status === 'lobby'
          ? { text: 'Lobby', className: 'border border-white/30 text-white/70' }
          : { text: 'Closed', className: 'border border-white/20 text-white/50' };
  return (
    <li>
      <Link
        href={`/play/${crown.id}`}
        className="block border border-white/10 bg-black/40 p-4 transition-colors hover:border-[#99ee2d]/60"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate font-poster text-xl uppercase leading-none text-white">{crown.title}</p>
          <span className={`shrink-0 px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${badge.className}`}>
            {badge.text}
          </span>
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase text-white/50">
          {GAMES[crown.game]?.title ?? crown.game} · pot {ckbWhole(BigInt(crown.potShannons))} CKB
          {crown.hosted ? ' · host' : ''}
        </p>
        <p className="mt-1 font-mono text-[10px] uppercase text-white/40">
          Score to beat {crown.kingScore}
          {crown.bestScore != null ? ` · your best ${crown.bestScore}` : ''}
        </p>
      </Link>
    </li>
  );
}

function StatTile({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="border border-white/10 bg-black/40 p-3">
      <div className="text-[#99ee2d]">{icon}</div>
      <p className="mt-1 font-poster text-2xl text-white">{value}</p>
      <p className="font-mono text-[10px] font-bold uppercase text-white/40">{label}</p>
    </div>
  );
}
