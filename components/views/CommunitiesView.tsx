'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, UsersRound } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import {
  useCommunitiesQuery,
  useCreateCommunity,
} from '@/hooks/useCommunity';
import { CoverPicker } from '@/components/CoverPicker';
import { posterDataUri } from '@/lib/poster';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';

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
  const [coverImageUrl, setCoverImageUrl] = useState(posterDataUri('New room'));
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
          setCoverImageUrl(posterDataUri('New room'));
          setCoverLocked(false);
          router.push(`/communities/${community.slug}`);
        },
      },
    );
  }

  const list = communities.data ?? [];

  return (
    <PageShell
      eyebrow="Rooms for living Cells"
      title="Communities"
      intro="Rooms for living Cells. Join one, or start your own."
      backHref="/"
      backLabel="Home"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {!isConnected ? (
          <button
            type="button"
            onClick={() => connect()}
            className="neo-button bg-[#224cff] px-4 py-2.5 text-xs font-black uppercase text-[#fff8e7]"
          >
            Connect wallet
          </button>
        ) : me?.onboarded ? (
          <button
            type="button"
            onClick={() => setOpenForm((v) => !v)}
            className="neo-button inline-flex items-center gap-1.5 bg-[#ff4cbd] px-4 py-2.5 text-xs font-black uppercase"
          >
            <Plus className="h-3.5 w-3.5 stroke-[3]" />
            Create community
          </button>
        ) : hasHandle || usernameLoading ? (
          <p className="text-sm font-semibold">Loading your profile…</p>
        ) : (
          <p className="text-sm font-semibold">Claim an @handle to create a room.</p>
        )}
      </div>

      {openForm && (
        <form onSubmit={submit} className="mb-6 border-[3px] border-black bg-[#ffe454] p-5">
          <h2 className="font-poster text-2xl uppercase leading-none">New community</h2>
          <label className="mt-4 block">
            <span className="text-[10px] font-black uppercase tracking-wider">Name</span>
            <input
              value={name}
              onChange={(e) => {
                const next = e.target.value;
                setName(next);
                if (!coverLocked) setCoverImageUrl(posterDataUri(next || 'New room'));
              }}
              maxLength={40}
              required
              placeholder="e.g. Lagos Builders"
              className="mt-2 w-full border-[3px] border-black bg-[#fff8e7] px-3 py-2.5 text-sm font-semibold outline-none"
            />
          </label>
          <label className="mt-3 block">
            <span className="text-[10px] font-black uppercase tracking-wider">Blurb</span>
            <textarea
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              maxLength={180}
              required
              rows={3}
              placeholder="What do people do in this room?"
              className="mt-2 w-full resize-none border-[3px] border-black bg-[#fff8e7] px-3 py-2.5 text-sm font-semibold outline-none"
            />
          </label>
          <CoverPicker
            value={coverImageUrl}
            seed={name || 'New room'}
            label="Room cover"
            onChange={(url) => {
              setCoverImageUrl(url);
              setCoverLocked(true);
            }}
          />
          {create.error && (
            <p role="alert" className="mt-2 text-sm font-bold text-red-800">
              {create.error.message}
            </p>
          )}
          <button
            type="submit"
            disabled={create.isPending}
            className="neo-button mt-4 flex items-center gap-2 bg-[#224cff] px-4 py-3 text-xs font-black uppercase text-[#fff8e7] disabled:opacity-40"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create room
          </button>
        </form>
      )}

      <ul className="grid gap-4 sm:grid-cols-2">
        {list.map((community) => (
          <li key={community.id}>
            <Link
              href={`/communities/${community.slug}`}
              className="neo-card block overflow-hidden bg-[#fff8e7] p-0 transition hover:-translate-y-0.5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={community.coverImageUrl}
                alt=""
                className="h-28 w-full object-cover"
              />
              <div className="border-t-[3px] border-black p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-poster text-2xl uppercase leading-none">{community.name}</h2>
                  {community.featured && (
                    <span className="border-2 border-black bg-[#d6ff00] px-1.5 py-0.5 text-[9px] font-black uppercase">
                      Featured
                    </span>
                  )}
                  {community.isMember && (
                    <span className="border-2 border-black bg-[#ff4cbd] px-1.5 py-0.5 text-[9px] font-black uppercase">
                      Joined
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs font-semibold leading-relaxed">{community.blurb}</p>
                <p className="mt-3 flex items-center gap-1 font-mono text-[10px] font-bold text-black/60">
                  <UsersRound className="h-3 w-3 stroke-[3]" />
                  {community.memberCount} members · {community.liveStreakCount} live streaks
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
