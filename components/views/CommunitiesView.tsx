'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import {
  useCommunitiesQuery,
  useCreateCommunity,
} from '@/hooks/useCommunity';
import { CoverPicker } from '@/components/CoverPicker';
import { arenaCoverForSeed, resolveCover } from '@/lib/poster';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { ArenaRailCard, ArenaStage } from '@/components/arena/ArenaStage';

/**
 * Community discovery — persistent groups that host Events.
 */
export function CommunitiesView() {
  const router = useRouter();
  const { address, isConnected, connect } = useWallet();
  const myBuilder = useMyBuilder();
  const { username: onChainUsername, isLoading: usernameLoading } = useUsername();
  const communities = useCommunitiesQuery();
  const create = useCreateCommunity();
  const me = myBuilder.data?.builder;
  const hasHandle = Boolean(me?.onboarded || onChainUsername?.username);

  const [openForm, setOpenForm] = useState(false);
  const [name, setName] = useState('');
  const [blurb, setBlurb] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState(arenaCoverForSeed('New community'));
  const [coverLocked, setCoverLocked] = useState(false);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!address || !me?.onboarded || create.isPending) return;
    create.mutate(
      { address, name, blurb, coverImageUrl },
      {
        onSuccess: (community) => {
          setOpenForm(false);
          setName('');
          setBlurb('');
          setCoverImageUrl(arenaCoverForSeed('New community'));
          setCoverLocked(false);
          router.push(`/communities/${community.slug}`);
        },
      },
    );
  }

  const list = communities.data ?? [];
  const featured = list.filter((c) => c.featured);
  const rail = (featured.length > 0 ? featured : list).slice(0, 4);
  const rest = list.filter((c) => !rail.some((r) => r.id === c.id));

  return (
    <ArenaStage backHref="/" backLabel="Home">
      <section className="grid items-end gap-8 lg:grid-cols-[1fr_auto_minmax(260px,320px)] lg:gap-0">
        <div className="relative z-10 max-w-xl pb-6">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
            Social layer
          </p>
          <h1 className="mt-3 font-poster text-[clamp(2.75rem,6vw,4.5rem)] uppercase leading-[0.92] text-white">
            Communities
          </h1>
          <p className="mt-4 max-w-md text-base font-light leading-relaxed text-white/60">
            Join a community, host or join events. Communities organize the nights —
            the game stays Stake → Turn → Pass → Settle.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {!isConnected ? (
              <ArenaCta onClick={() => connect()}>Connect wallet</ArenaCta>
            ) : me?.onboarded ? (
              <ArenaCta onClick={() => setOpenForm((v) => !v)}>
                <Plus className="h-4 w-4" />
                {openForm ? 'Close form' : 'Create community'}
              </ArenaCta>
            ) : hasHandle || usernameLoading ? (
              <p className="text-sm text-white/55">Loading your profile…</p>
            ) : (
              <ArenaCta href="/join">Claim @handle</ArenaCta>
            )}
            <Link
              href="/events"
              className="border-b border-[#bef970] pb-1 text-sm font-bold uppercase tracking-wide text-white"
            >
              Live events →
            </Link>
          </div>
        </div>

        <div className="relative mx-auto hidden h-[min(52vh,480px)] w-[280px] shrink-0 lg:block xl:w-[320px]">
          <div
            className="pointer-events-none absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-[#a855f7]/35 blur-[80px]"
            aria-hidden
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/uismod/organizer.png"
            alt=""
            className="relative z-10 h-full w-full object-contain object-bottom drop-shadow-[0_0_40px_rgba(168,85,247,0.45)]"
          />
        </div>

        <aside className="relative z-10 border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div
            className="pointer-events-none absolute left-0 top-8 hidden h-[70%] w-px bg-gradient-to-b from-[#99ee2d] via-[#a855f7] to-transparent lg:block"
            aria-hidden
          />
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#99ee2d]">
            Featured
          </p>
          <ul className="mt-4 space-y-2.5">
            {communities.isLoading ? (
              <li className="flex items-center gap-2 text-sm text-white/45">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </li>
            ) : rail.length === 0 ? (
              <li className="text-sm text-white/50">No communities yet.</li>
            ) : (
              rail.map((c) => (
                <li key={c.id}>
                  <ArenaRailCard
                    href={`/communities/${c.slug}`}
                    eyebrow={`${c.liveEventCount} open · ${c.memberCount} members`}
                    title={c.name}
                    meta={`${c.liveEventCount} live/open · ${c.blurb.slice(0, 48)}`}
                    cover={resolveCover(c.coverImageUrl, c.name)}
                    cta="Enter"
                  />
                </li>
              ))
            )}
          </ul>
        </aside>
      </section>

      {openForm ? (
        <form
          onSubmit={submit}
          className="relative z-10 mt-10 max-w-xl border border-white/10 bg-black/45 p-5 backdrop-blur-md"
        >
          <h2 className="font-poster text-2xl uppercase text-white">New community</h2>
          <label className="mt-4 block">
            <span className="text-[10px] font-bold uppercase text-white/45">Name</span>
            <input
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!coverLocked) setCoverImageUrl(arenaCoverForSeed(e.target.value || 'community'));
              }}
              className="mt-2 w-full border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-[#99ee2d]"
              placeholder="e.g. Anime"
            />
          </label>
          <label className="mt-4 block">
            <span className="text-[10px] font-bold uppercase text-white/45">Description</span>
            <textarea
              required
              rows={3}
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              className="mt-2 w-full resize-none border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-[#99ee2d]"
              placeholder="What this community gathers around…"
            />
          </label>
          <CoverPicker
            value={coverImageUrl}
            seed={name || 'community'}
            onChange={(url) => {
              setCoverImageUrl(url);
              setCoverLocked(true);
            }}
            label="Banner"
          />
          {create.error ? (
            <p className="mt-3 text-sm text-[#99ee2d]">{create.error.message}</p>
          ) : null}
          <ArenaCta type="submit" className="mt-5" disabled={create.isPending}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create community
          </ArenaCta>
        </form>
      ) : null}

      <section className="relative z-10 mt-14">
        <h2 className="mb-6 font-poster text-3xl uppercase text-white sm:text-4xl">
          All communities
        </h2>
        {communities.isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        ) : list.length === 0 ? (
          <p className="text-sm text-white/55">Nothing here yet.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(rest.length > 0 ? rest : list).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/communities/${c.slug}`}
                  className="arena-card block overflow-hidden border border-white/10 bg-white/5 transition hover:border-[#99ee2d]/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveCover(c.coverImageUrl, c.name)}
                    alt=""
                    className="h-36 w-full bg-black/40 object-cover"
                  />
                  <span className="block p-4">
                    <span className="font-poster text-2xl uppercase text-white">{c.name}</span>
                    <span className="mt-2 block text-sm font-light text-white/55 line-clamp-2">
                      {c.blurb}
                    </span>
                    <span className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] font-bold uppercase text-white/50">
                      <span>{c.memberCount} members</span>
                      <span>·</span>
                      <span>{c.liveEventCount} open</span>
                      <span>·</span>
                      <span className="text-[#99ee2d]">{c.liveEventCount} open</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </ArenaStage>
  );
}
