'use client';

import Link from 'next/link';
import { Crown, Flame, Loader2, Pencil, Trophy, UsersRound, WalletMinimal } from 'lucide-react';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { CharacterAvatar } from '@/components/CharacterPicker';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';
import { useCommunitiesQuery } from '@/hooks/useCommunity';
import { useEventsQuery } from '@/hooks/useEvents';

/**
 * Event-product profile — identity, stats, communities, Studio entry.
 * Not the old Living Collectible passport.
 */
export function ProfileView({ address }: { address: string }) {
  const { isConnected, connect, formattedAddress, address: walletAddress, isReady } =
    useWallet();
  const myBuilder = useMyBuilder();
  const { username: onChainUsername } = useUsername();
  const communities = useCommunitiesQuery();
  const eventsQ = useEventsQuery();

  const normalized = decodeURIComponent(address).toLowerCase();
  const isSelf =
    address === 'me' ||
    Boolean(walletAddress && walletAddress.toLowerCase() === normalized);

  if (!isReady) {
    return (
      <ArenaStage backHref="/" backLabel="Home">
        <Loader2 className="h-6 w-6 animate-spin text-[#99ee2d]" />
      </ArenaStage>
    );
  }

  if ((isSelf || address === 'me') && !isConnected) {
    return (
      <ArenaStage backHref="/" backLabel="Home">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
          Profile
        </p>
        <h1 className="mt-3 font-poster text-4xl uppercase text-white">Connect to view</h1>
        <p className="mt-3 max-w-md text-sm text-white/55">
          Your profile, avatar, and event stats are tied to your wallet.
        </p>
        <ArenaCta onClick={() => connect()} className="mt-6">
          <WalletMinimal className="h-4 w-4" />
          Connect wallet
        </ArenaCta>
      </ArenaStage>
    );
  }

  const me = myBuilder.data?.builder;
  const handle = me?.username || onChainUsername?.username || null;
  const displayName = isSelf
    ? me?.displayName || handle || 'You'
    : handle || `${normalized.slice(0, 10)}…`;

  const myEvents = isSelf
    ? (eventsQ.data?.events ?? []).filter(
        (e) =>
          e.hostAddress?.toLowerCase() === walletAddress?.toLowerCase() ||
          e.hostName.toLowerCase() === (me?.displayName ?? '').toLowerCase(),
      )
    : [];
  const joinedCommunities = isSelf
    ? (communities.data ?? []).filter((c) => c.isMember)
    : [];

  return (
    <ArenaStage backHref="/" backLabel="Home">
      <section className="grid items-start gap-8 lg:grid-cols-[minmax(220px,280px)_1fr] lg:gap-10">
        <div className="relative z-10">
          <div className="aspect-square w-full max-w-[280px] overflow-hidden border border-white/10 bg-black/50">
            {me?.characterId ? (
              <div className="flex h-full items-center justify-center bg-gradient-to-b from-[#a855f7]/30 to-transparent p-6">
                <CharacterAvatar characterId={me.characterId} size="xl" />
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
              Edit profile · Mint Spore
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
            <p className="mt-2 text-sm text-white/50">
              No @handle yet.{' '}
              <Link href="/join" className="text-[#99ee2d] underline">
                Claim one
              </Link>
            </p>
          ) : null}
          {me?.headline ? (
            <p className="mt-4 max-w-lg text-base font-light leading-relaxed text-white/60">
              {me.headline}
            </p>
          ) : (
            <p className="mt-4 max-w-lg text-sm font-light text-white/45">
              {isSelf
                ? 'Add a bio in Studio. Mint a Spore avatar when you’re ready.'
                : 'Player on Keepers Relay.'}
            </p>
          )}

          {isSelf && formattedAddress ? (
            <p className="mt-4 flex flex-wrap items-center gap-2 font-mono text-[10px] text-white/40">
              <WalletMinimal className="h-3.5 w-3.5" />
              {formattedAddress}
            </p>
          ) : null}

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile icon={<Trophy className="h-4 w-4" />} value="—" label="Wins" />
            <StatTile icon={<Flame className="h-4 w-4" />} value="—" label="Streak" />
            <StatTile
              icon={<UsersRound className="h-4 w-4" />}
              value={String(myEvents.length)}
              label="Hosted"
            />
            <StatTile
              icon={<Crown className="h-4 w-4" />}
              value={String(joinedCommunities.length)}
              label="Communities"
            />
          </div>
          <p className="mt-3 font-mono text-[10px] uppercase text-white/35">
            Wins / losses / CKB earned fill in when event history is persisted.
          </p>
        </div>
      </section>

      {isSelf ? (
        <section className="relative z-10 mt-14">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-poster text-2xl uppercase text-white sm:text-3xl">
              Your communities
            </h2>
            <Link
              href="/communities"
              className="border-b border-[#bef970] pb-1 text-[10px] font-bold uppercase text-white"
            >
              Browse all →
            </Link>
          </div>
          {communities.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-white/40" />
          ) : joinedCommunities.length === 0 ? (
            <p className="text-sm text-white/55">
              You haven&apos;t joined a community yet.{' '}
              <Link href="/communities" className="text-[#99ee2d] underline">
                Find one
              </Link>
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {joinedCommunities.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/communities/${c.slug}`}
                    className="block border border-white/10 bg-black/40 px-4 py-3 transition hover:border-[#99ee2d]/40"
                  >
                    <span className="font-poster text-xl uppercase text-white">{c.name}</span>
                    <span className="mt-1 block font-mono text-[10px] uppercase text-white/45">
                      {c.memberCount} members · {c.liveEventCount} open
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {isSelf ? (
        <section className="relative z-10 mt-12">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-poster text-2xl uppercase text-white sm:text-3xl">
              Events you host
            </h2>
            <Link
              href="/create"
              className="border-b border-[#bef970] pb-1 text-[10px] font-bold uppercase text-white"
            >
              Create event →
            </Link>
          </div>
          {eventsQ.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-white/40" />
          ) : myEvents.length === 0 ? (
            <p className="text-sm text-white/55">
              No hosted events yet. Host from a community or{' '}
              <Link href="/create" className="text-[#99ee2d] underline">
                start fresh
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-2">
              {myEvents.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/events/${e.id}`}
                    className="flex items-center justify-between gap-3 border border-white/10 bg-black/40 px-4 py-3 transition hover:border-[#99ee2d]/40"
                  >
                    <span>
                      <span className="block font-poster text-lg uppercase text-white">
                        {e.name}
                      </span>
                      <span className="font-mono text-[10px] uppercase text-white/45">
                        {e.status} · {e.pot} CKB · {e.playerCount}/{e.maxPlayers}
                      </span>
                    </span>
                    <span className="text-xs font-bold uppercase text-[#99ee2d]">Open →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {isSelf ? (
        <section className="relative z-10 mt-12 border border-white/10 bg-black/40 p-5">
          <h2 className="font-poster text-xl uppercase text-white">Studio</h2>
          <p className="mt-2 max-w-lg text-sm font-light text-white/55">
            Mint a Spore avatar on-chain, pick a cast figure, edit display name and bio. Studio
            lives here — not as a separate product in the nav.
          </p>
          <ArenaCta href="/profile/edit" className="mt-5">
            Open Studio · Mint Spore
          </ArenaCta>
        </section>
      ) : null}
    </ArenaStage>
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
