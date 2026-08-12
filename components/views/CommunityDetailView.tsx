'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, Rocket, UsersRound } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { InviteButton } from '@/components/InviteButton';
import { StreakCard } from '@/components/StreakCard';
import {
  useCommunityQuery,
  useJoinCommunity,
  useLeaveCommunity,
} from '@/hooks/useCommunity';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';

export function CommunityDetailView({ slug }: { slug: string }) {
  const { address, isConnected, connect } = useWallet();
  const invited = useSearchParams().get('invite') === '1';
  const myBuilder = useMyBuilder();
  const { username: onChainUsername } = useUsername();
  const detail = useCommunityQuery(slug);
  const join = useJoinCommunity();
  const leave = useLeaveCommunity();
  const me = myBuilder.data?.builder;

  const community = detail.data?.community;
  const streaks = detail.data?.streaks ?? [];
  const members = detail.data?.members ?? [];

  if (detail.isLoading) {
    return (
      <PageShell eyebrow="Community" title="Loading…" backHref="/communities">
        <Loader2 className="h-6 w-6 animate-spin" />
      </PageShell>
    );
  }

  if (detail.isError || !community) {
    return (
      <PageShell eyebrow="Community" title="Not found" backHref="/communities">
        <p className="text-sm font-semibold">That room doesn’t exist.</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={community.featured ? 'Featured room' : 'Community'}
      title={community.name}
      intro={community.blurb}
      backHref="/communities"
      backLabel="All communities"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={community.coverImageUrl}
        alt=""
        className="mb-5 h-40 w-full border-[3px] border-black object-cover"
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="border-2 border-black bg-white px-2 py-1 font-mono text-[10px] font-bold">
          {community.memberCount} members
        </span>
        <span className="border-2 border-black bg-white px-2 py-1 font-mono text-[10px] font-bold">
          {community.liveStreakCount} live
        </span>
        <span className="border-2 border-black bg-[#ffe454] px-2 py-1 font-mono text-[10px] font-bold">
          by {community.creatorName}
        </span>
        <InviteButton
          compact
          url={`/communities/${slug}?invite=1`}
          title={`Join ${community.name} on Keepers Relay`}
          text={`You're invited to ${community.name} on Keepers Relay.`}
        />

        {!isConnected ? (
          <button
            type="button"
            onClick={() => connect()}
            className="neo-button bg-[#224cff] px-3 py-2 text-[10px] font-black uppercase text-[#fff8e7]"
          >
            Connect
          </button>
        ) : !me?.onboarded ? (
          <p className="text-xs font-black uppercase">
            {onChainUsername?.username
              ? `Welcome, @${onChainUsername.username}`
              : 'Claim an @handle to join'}
          </p>
        ) : community.isMember ? (
          <>
            <Link
              href={`/launch?community=${community.id}`}
              className="neo-button inline-flex items-center gap-1.5 bg-[#ff4cbd] px-3 py-2 text-[10px] font-black uppercase"
            >
              <Rocket className="h-3.5 w-3.5 stroke-[3]" />
              Launch streak here
            </Link>
            {address === community.creatorAddress && (
              <Link
                href={`/communities/${slug}/admin`}
                className="neo-button bg-[#224cff] px-3 py-2 text-[10px] font-black uppercase text-[#fff8e7]"
              >
                Admin
              </Link>
            )}
            {!community.featured && (
              <button
                type="button"
                disabled={leave.isPending}
                onClick={() => address && leave.mutate({ slug, address })}
                className="border-2 border-black px-3 py-2 text-[10px] font-black uppercase"
              >
                Leave
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={join.isPending || !address}
            onClick={() => address && join.mutate({ slug, address })}
            className="neo-button bg-[#d6ff00] px-3 py-2 text-[10px] font-black uppercase disabled:opacity-40"
          >
            {join.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Join community'}
          </button>
        )}
      </div>

      {invited && !community.isMember && (
        <p className="mb-4 border-[3px] border-black bg-[#d6ff00] p-3 text-sm font-semibold">
          You were invited. Connect, then tap Join.
        </p>
      )}

      {(join.error || leave.error) && (
        <p className="mb-4 text-sm font-bold text-red-800">
          {join.error?.message ?? leave.error?.message}
        </p>
      )}

      <section className="mb-8">
        <h2 className="font-poster text-3xl uppercase leading-none">Live streaks</h2>
        <p className="mt-2 text-sm font-semibold">
          Open a streak to watch the clock. Join the room to hold or pass.
        </p>
        {streaks.length === 0 ? (
          <p className="mt-4 border-[3px] border-black bg-[#fff8e7] p-4 text-sm font-semibold">
            No streaks yet.{' '}
            {community.isMember ? 'Launch the first one.' : 'Join to launch.'}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {streaks.map((streak) => (
              <StreakCard key={streak.id} streak={streak} showCommunity={false} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="flex items-center gap-2 font-poster text-2xl uppercase leading-none">
          <UsersRound className="h-5 w-5 stroke-[3]" />
          Members
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {members.map((member) => (
            <li
              key={member.address}
              className="border-2 border-black bg-white px-2 py-1 text-xs font-bold"
            >
              {member.username ? `@${member.username}` : member.displayName}
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
