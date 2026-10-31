'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Check, Copy, Pencil, WalletMinimal } from 'lucide-react';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { ChainLoader } from '@/components/arena/ChainLoader';
import { Avatar } from '@/components/duel/Avatar';
import { Button } from '@/components/ui/Button';
import { Ckb, EmptyState, StatusChip } from '@/components/ui/kit';
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
  const [copied, setCopied] = useState(false);

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
      <ArenaStage>
        <ChainLoader title="Loading the profile…" />
      </ArenaStage>
    );
  }

  if (address === 'me' && !isConnected) {
    return (
      <ArenaStage>
        <EmptyState
          title="Connect to view"
          body="Your profile and picture are tied to your wallet."
          action={
            <ArenaCta onClick={() => void ensureAuth().catch(() => undefined)}>
              <WalletMinimal className="h-4 w-4" />
              Connect wallet
            </ArenaCta>
          }
        />
      </ArenaStage>
    );
  }

  const handle = profile?.username || (isSelf ? onChainUsername?.username : null) || null;
  const displayName = profile?.displayName || handle || (isSelf ? 'You' : `${target.slice(0, 10)}…`);
  const s = stats.data;
  const tile = (value: number | string | null | undefined) => (stats.isLoading ? '…' : value == null ? '—' : String(value));

  return (
    <ArenaStage>
      <section className="flex flex-col gap-6 md:flex-row md:items-center">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-[30px] bg-ink-3 ring-2 ring-lime ring-offset-2 ring-offset-ink md:h-32 md:w-32">
          {avatar.data?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar.data.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : profile?.characterId ? (
            <div className="flex h-full items-center justify-center">
              <CharacterAvatar characterId={profile.characterId} size="lg" />
            </div>
          ) : (
            <Avatar name={handle ? `@${handle}` : displayName} tone="#99ee2d" size={128} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-poster text-3xl font-black uppercase md:text-4xl">{displayName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-mute">
            {handle ? <span className="font-semibold text-white">@{handle}</span> : isSelf ? <span>No @handle yet.</span> : null}
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(target);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
              className="inline-flex items-center gap-1.5 rounded-md font-mono text-xs hover:text-white"
            >
              {target.slice(0, 7)}…{target.slice(-4)} {copied ? <Check className="h-3.5 w-3.5 text-lime" aria-label="Copied" /> : <Copy className="h-3.5 w-3.5" aria-label="Copy address" />}
            </button>
          </p>
          {profile?.headline ? <p className="mt-3 max-w-lg font-semibold">{profile.headline}</p> : isSelf ? <p className="mt-3 text-sm text-mute">Add a bio in Edit profile.</p> : null}
        </div>
        <div className="flex flex-wrap gap-3">
          {isSelf ? (
            <>
              {!handle ? (
                <Button href="/join?next=/profile" variant="pink" size="lg">
                  Claim a username
                </Button>
              ) : null}
              <Button href="/profile/edit" variant="ghost" size="lg">
                <Pencil className="h-4 w-4" /> Edit profile
              </Button>
            </>
          ) : (
            <Button href={`/duels/new?vs=${encodeURIComponent(target)}`} variant="pink" size="lg">
              Challenge
            </Button>
          )}
        </div>
      </section>

      <section aria-label="Stats" className="mt-10 grid gap-4 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div className="clip-panel bg-gold p-5 text-ink">
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider">CKB won</p>
          <p className="mt-1 font-poster text-4xl font-black tabular-nums">{tile(s ? ckbWhole(BigInt(s.wonShannons)) : null)}</p>
        </div>
        {(
          [
            ['Wins', tile(s?.wins)],
            ['Crowns taken', tile(s?.crownsTaken)],
            ['Best score', tile(s?.bestScore)],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-ink-2 p-5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-mute">{k}</p>
            <p className="mt-1 font-poster text-2xl font-black tabular-nums">{v}</p>
          </div>
        ))}
      </section>
      {s && (s.holding > 0 || s.hosted > 0) ? (
        <p className="mt-3 font-mono text-[10px] uppercase text-mute">
          {s.holding > 0 ? `Holding ${s.holding} now` : null}
          {s.holding > 0 && s.hosted > 0 ? ' · ' : null}
          {s.hosted > 0 ? `Hosted ${s.hosted}` : null}
        </p>
      ) : null}
      {stats.isError ? <p className="mt-3 text-sm text-danger">Stats could not load. Refresh to try again.</p> : null}

      <section className="mt-12" aria-labelledby="history">
        <h2 id="history" className="font-poster text-lg font-bold uppercase">
          {isSelf ? 'Your crowns' : 'Crowns'} <span className="ml-1 font-mono text-xs text-mute">{s?.crowns.length ?? ''}</span>
        </h2>
        <div className="mt-6">
          {stats.isLoading ? (
            <ChainLoader compact title="Loading crowns…" />
          ) : (s?.crowns ?? []).length === 0 ? (
            <EmptyState
              title="No crowns yet"
              body={isSelf ? 'Take your first crown and it shows up here.' : 'No crowns played yet.'}
              action={isSelf ? <Button href="/play">Find a crown</Button> : <Button href={`/duels/new?vs=${encodeURIComponent(target)}`} variant="pink">Challenge</Button>}
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {s!.crowns.map((crown) => (
                <CrownRow key={crown.id} crown={crown} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </ArenaStage>
  );
}

function CrownRow({ crown }: { crown: PlayerCrown }) {
  const won = crown.holds && crown.status === 'settled';
  const badge = won ? (
    <StatusChip tone="closed">Won</StatusChip>
  ) : crown.holds ? (
    <StatusChip tone="live">Holding</StatusChip>
  ) : crown.status === 'live' ? (
    <StatusChip tone="live">Live</StatusChip>
  ) : crown.status === 'lobby' ? (
    <StatusChip tone="lobby">Lobby</StatusChip>
  ) : (
    <StatusChip tone="lobby">Closed</StatusChip>
  );
  return (
    <li>
      <Link href={`/play/${crown.id}`} className="clip-panel block bg-ink-2 p-5 transition-colors hover:bg-ink-3">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate font-poster text-base font-bold uppercase">{crown.title}</p>
          {badge}
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-mute">Prize pot</p>
        <Ckb value={ckbWhole(BigInt(crown.potShannons))} size="md" />
        <p className="mt-2 text-xs text-mute">
          {GAMES[crown.game]?.title ?? crown.game} · to beat {crown.kingScore}
          {crown.bestScore != null ? ` · best ${crown.bestScore}` : ''}
          {crown.hosted ? ' · host' : ''}
        </p>
      </Link>
    </li>
  );
}
