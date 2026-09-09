'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, UsersRound } from 'lucide-react';
import { InviteButton } from '@/components/InviteButton';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { EventFeatureCard } from '@/components/arena/EventFeatureCard';
import {
  useCommunityQuery,
  useJoinCommunity,
  useLeaveCommunity,
} from '@/hooks/useCommunity';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';
import { resolveCover } from '@/lib/poster';
import { CharacterAvatar } from '@/components/CharacterPicker';
import type { CharacterId } from '@/lib/characters';

type Tab = 'overview' | 'events' | 'members' | 'leaderboard' | 'about';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'events', label: 'Events' },
  { id: 'members', label: 'Members' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'about', label: 'About' },
];

export function CommunityDetailView({ slug }: { slug: string }) {
  const { address, isConnected, connect } = useWallet();
  const invited = useSearchParams().get('invite') === '1';
  const invitedBy = useSearchParams().get('by');
  const myBuilder = useMyBuilder();
  const { username: onChainUsername } = useUsername();
  const detail = useCommunityQuery(slug);
  const join = useJoinCommunity();
  const leave = useLeaveCommunity();
  const me = myBuilder.data?.builder;
  const [tab, setTab] = useState<Tab>('overview');

  const community = detail.data?.community;
  const events = detail.data?.events ?? [];
  const members = detail.data?.members ?? [];

  if (detail.isLoading) {
    return (
      <ArenaStage backHref="/communities" backLabel="Communities">
        <Loader2 className="h-6 w-6 animate-spin text-[#99ee2d]" />
      </ArenaStage>
    );
  }

  if (detail.isError || !community) {
    return (
      <ArenaStage backHref="/communities" backLabel="Communities">
        <h1 className="font-poster text-4xl uppercase text-white">Not found</h1>
        <p className="mt-3 text-sm text-white/60">That community doesn’t exist.</p>
      </ArenaStage>
    );
  }

  const cover = resolveCover(community.coverImageUrl, community.name);
  const liveEvents = events.filter((e) => e.status === 'live' || e.status === 'ready');
  const upcoming = events.filter((e) => e.status === 'registration');
  const past = events.filter((e) => e.status === 'finished' || e.status === 'settled');

  const isOwner = Boolean(
    address &&
      community.creatorAddress &&
      address.toLowerCase() === community.creatorAddress.toLowerCase(),
  );

  return (
    <ArenaStage backHref="/communities" backLabel="Communities">
      <section className="grid items-end gap-8 lg:grid-cols-[1fr_auto] lg:gap-10">
        <div className="relative z-10 max-w-xl pb-4">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
            {community.featured ? 'Featured community' : 'Community'}
          </p>
          <h1 className="mt-3 font-poster text-[clamp(2.75rem,6vw,4.5rem)] uppercase leading-[0.9] text-white">
            {community.name}
          </h1>
          <p className="mt-4 max-w-md text-base font-light leading-relaxed text-white/60">
            {community.blurb}
          </p>
          <p className="mt-2 font-mono text-[10px] uppercase text-white/40">
            Created by {community.creatorName}
          </p>
          <div className="mt-6 flex flex-wrap gap-2 font-mono text-[10px] font-bold uppercase">
            <span className="border border-[#99ee2d]/40 bg-[#99ee2d]/10 px-2 py-1 text-[#99ee2d]">
              {community.liveEventCount} open events
            </span>
            <span className="border border-white/15 px-2 py-1 text-white/70">
              {community.memberCount} members
            </span>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {!isConnected ? (
              <ArenaCta onClick={() => connect()}>Connect</ArenaCta>
            ) : !me?.onboarded ? (
              <ArenaCta href="/join">
                {onChainUsername?.username
                  ? `Continue as @${onChainUsername.username}`
                  : 'Claim @handle'}
              </ArenaCta>
            ) : community.isMember ? (
              <>
                {isOwner ? (
                  <ArenaCta href={`/create?community=${community.id}`}>
                    Create event
                  </ArenaCta>
                ) : (
                  <p className="font-mono text-[10px] uppercase text-white/45">
                    Only the community owner can create events here
                  </p>
                )}
                {!community.featured ? (
                  <button
                    type="button"
                    disabled={leave.isPending}
                    onClick={() => address && leave.mutate({ slug, address })}
                    className="text-[10px] font-bold uppercase text-white/45 underline-offset-2 hover:underline"
                  >
                    Leave
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <ArenaCta
                  disabled={join.isPending || !address}
                  onClick={() => {
                    if (!address) return;
                    join.mutate({
                      slug,
                      address,
                      invitedByAddress: invited ? invitedBy ?? undefined : undefined,
                    });
                  }}
                >
                  <UsersRound className="h-4 w-4" />
                  {join.isPending
                    ? 'Joining…'
                    : invited
                      ? 'Accept invite & join'
                      : 'Join community'}
                </ArenaCta>
                {join.error ? (
                  <p className="w-full text-sm text-[#99ee2d]">{join.error.message}</p>
                ) : null}
              </>
            )}
            <InviteButton
              variant="arena"
              url={`/communities/${slug}?invite=1${address ? `&by=${encodeURIComponent(address)}` : ''}`}
              title={`Join ${community.name} on Keepers Relay`}
              text={`Join the ${community.name} community on Keepers Relay:`}
            />
          </div>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover}
          alt=""
          className="mx-auto hidden h-56 w-full max-w-sm border border-white/10 object-cover lg:block"
        />
      </section>

      <nav className="mt-10 flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider ${
              tab === t.id
                ? 'bg-[#99ee2d] text-[#111]'
                : 'border border-white/15 text-white/60 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="mt-8">
        {tab === 'overview' ? (
          <div className="space-y-10">
            <section>
              <div className="mb-4 flex items-end justify-between">
                <h2 className="font-poster text-2xl uppercase text-white">Open events</h2>
                {isOwner ? (
                  <Link
                    href={`/create?community=${community.id}`}
                    className="text-[10px] font-bold uppercase text-[#99ee2d]"
                  >
                    Create event →
                  </Link>
                ) : null}
              </div>
              {liveEvents.length + upcoming.length === 0 ? (
                <p className="text-sm text-white/50">
                  No open events.{' '}
                  {isOwner ? (
                    <Link
                      href={`/create?community=${community.id}`}
                      className="text-[#99ee2d] underline"
                    >
                      Create one
                    </Link>
                  ) : null}
                </p>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {[...liveEvents, ...upcoming].slice(0, 6).map((event, i) => (
                    <li key={event.id}>
                      <EventFeatureCard event={event} artIndex={i} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <div className="mb-4 flex items-end justify-between">
                <h2 className="font-poster text-2xl uppercase text-white">Members</h2>
                <button
                  type="button"
                  onClick={() => setTab('members')}
                  className="text-[10px] font-bold uppercase text-[#99ee2d]"
                >
                  View all →
                </button>
              </div>
              {members.length === 0 ? (
                <p className="text-sm text-white/50">No members yet.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {members.slice(0, 6).map((m) => (
                    <MemberCard key={m.address} m={m} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}

        {tab === 'events' ? (
          <div className="space-y-8">
            <EventBlock title="Live & ready" items={liveEvents} />
            <EventBlock title="Upcoming" items={upcoming} />
            <EventBlock title="Past" items={past} />
            {events.length === 0 ? (
              <p className="text-sm text-white/50">
                No events yet.{' '}
                {isOwner ? (
                  <Link
                    href={`/create?community=${community.id}`}
                    className="text-[#99ee2d] underline"
                  >
                    Create the first one
                  </Link>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === 'members' ? (
          members.length === 0 ? (
            <p className="text-sm text-white/50">No members yet.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((m) => (
                <MemberCard key={m.address} m={m} />
              ))}
            </ul>
          )
        ) : null}

        {tab === 'leaderboard' ? (
          <p className="text-sm text-white/55">
            Community leaderboards aggregate after more settled events. For now, open an event’s
            results page.
          </p>
        ) : null}

        {tab === 'about' ? (
          <div className="max-w-xl space-y-3 text-sm text-white/65">
            <p>{community.blurb}</p>
            <p className="font-mono text-[10px] uppercase text-white/40">
              Created by {community.creatorName} · {community.memberCount} members
            </p>
          </div>
        ) : null}
      </div>
    </ArenaStage>
  );
}

function MemberCard({
  m,
}: {
  m: {
    address: string;
    displayName: string;
    username: string;
    headline?: string;
    characterId?: string | null;
    role: string;
    eventsPlayed?: number;
  };
}) {
  return (
    <li className="flex items-start gap-3 border border-white/10 bg-black/40 p-4">
      {m.characterId ? (
        <CharacterAvatar characterId={m.characterId as CharacterId} size="md" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center border border-white/20 bg-white/5 text-xs font-bold text-white/50">
          {(m.displayName || '?')[0]}
        </span>
      )}
      <span className="min-w-0">
        <Link
          href={m.username ? `/u/${m.username}` : `/profile/${m.address}`}
          className="block font-poster text-lg uppercase text-white hover:text-[#99ee2d]"
        >
          {m.displayName}
        </Link>
        {m.username ? (
          <span className="block text-[11px] text-white/45">@{m.username}</span>
        ) : null}
        {m.headline ? (
          <span className="mt-1 block text-xs text-white/55 line-clamp-2">{m.headline}</span>
        ) : null}
        <span className="mt-2 block font-mono text-[10px] uppercase text-white/40">
          {m.role} · {m.eventsPlayed ?? 0} turns
        </span>
      </span>
    </li>
  );
}

function EventBlock({
  title,
  items,
}: {
  title: string;
  items: Parameters<typeof EventFeatureCard>[0]['event'][];
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-4 font-poster text-2xl uppercase text-white">{title}</h2>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((event, i) => (
          <li key={event.id}>
            <EventFeatureCard event={event} artIndex={i} />
          </li>
        ))}
      </ul>
    </section>
  );
}
