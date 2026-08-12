'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { AtSign, Handshake, Loader2, Sparkles } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { ProfileShareLink } from '@/components/ProfileShareLink';
import { usePublicProfile } from '@/hooks/usePublicProfile';
import { useEndorseUser, useEndorsements } from '@/hooks/useEndorsement';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';
import { registryConfigured } from '@/lib/registry/config';
import { estimateEndorsementCapacityCkb } from '@/lib/registry/endorsement';
import { normalizeUsername } from '@/lib/registry/encoding';

export function PublicProfileView({ username: raw }: { username: string }) {
  const username = normalizeUsername(raw);
  const publicProfile = usePublicProfile(username);
  const endorsements = useEndorsements(username);
  const { username: myUsername } = useUsername();
  const { isConnected, connect, address } = useWallet();
  const endorse = useEndorseUser(username);

  const [note, setNote] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const profile = publicProfile.data?.profile ?? null;
  const found = Boolean(publicProfile.data?.usernameRecord);
  const isSelf = Boolean(myUsername?.username && myUsername.username === username);
  const alreadyEndorsed = Boolean(
    address &&
      endorsements.data?.some((item) =>
        myUsername?.username
          ? item.endorserUsername === myUsername.username
          : false,
      ),
  );

  useEffect(() => {
    const next = publicProfile.data?.avatar?.imageUrl ?? null;
    setAvatarUrl(next);
    return () => {
      if (next) URL.revokeObjectURL(next);
    };
  }, [publicProfile.data?.avatar?.imageUrl]);

  if (!registryConfigured()) {
    return (
      <PageShell
        eyebrow="Public profile"
        title={`@${username}`}
        intro="This handle isn’t on-chain."
        backHref="/builders"
      />
    );
  }

  if (publicProfile.isLoading) {
    return (
      <PageShell eyebrow="Public profile" title={`@${username}`} backHref="/builders">
        <div className="h-48 animate-pulse border-[3px] border-black bg-[#ff4cbd]" />
      </PageShell>
    );
  }

  if (!found) {
    return (
      <PageShell
        eyebrow="404"
        title={`@${username}`}
        intro="No username cell for this handle."
        backHref="/builders"
      >
        <Link
          href="/studio"
          className="neo-button inline-flex bg-[#224cff] px-4 py-3 text-xs font-black uppercase text-[#fff8e7]"
        >
          Claim this handle
        </Link>
      </PageShell>
    );
  }

  const capacityHint = `~${estimateEndorsementCapacityCkb(note).toFixed(0)} CKB`;

  return (
    <PageShell
      eyebrow="Public builder"
      title={profile?.name ?? `@${username}`}
      intro={
        profile?.headline ||
        'On-chain Keepers profile — share this /u/ link, or drop a paid endorsement cell.'
      }
      backHref="/builders"
      backLabel="Builders roster"
    >
      <div className="mb-6 space-y-3">
        <ProfileShareLink username={username} />
        <p className="font-mono text-[10px] font-bold text-black/60">@{username}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="neo-card bg-[#ffe454] p-5">
          <div className="flex items-start gap-4">
            <div className="h-28 w-28 shrink-0 overflow-hidden border-[3px] border-black bg-[#fff8e7]">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <AtSign className="h-8 w-8 stroke-[3]" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em]">On-chain profile</p>
              <h2 className="mt-1 font-poster text-3xl uppercase leading-none">
                {profile?.name ?? username}
              </h2>
              {profile?.headline && (
                <p className="mt-3 text-sm font-semibold leading-relaxed">{profile.headline}</p>
              )}
              {profile?.bio && (
                <p className="mt-2 text-xs font-semibold text-black/70">{profile.bio}</p>
              )}
            </div>
          </div>
        </section>

        <section className="neo-card bg-[#224cff] p-5 text-[#fff8e7]">
          <div className="flex items-center gap-2">
            <Handshake className="h-5 w-5 stroke-[3] text-[#d6ff00]" />
            <h2 className="font-poster text-2xl uppercase leading-none">Endorse on-chain</h2>
          </div>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-[#fff8e7]/85">
            You sign a CKB tx that locks a small endorsement cell to this builder&apos;s lock. It
            costs capacity ({capacityHint} estimate) — not a free click.
          </p>

          {!isConnected ? (
            <button
              type="button"
              onClick={() => connect()}
              className="neo-button mt-4 bg-[#d6ff00] px-4 py-3 text-xs font-black uppercase text-black"
            >
              Connect wallet
            </button>
          ) : isSelf ? (
            <p className="mt-4 border-2 border-[#fff8e7] px-3 py-2 text-xs font-bold">
              This is your page — share the link so others can endorse you.
            </p>
          ) : alreadyEndorsed ? (
            <p className="mt-4 border-2 border-[#d6ff00] bg-[#d6ff00] px-3 py-2 text-xs font-black uppercase text-black">
              You already endorsed @{username}
            </p>
          ) : (
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                endorse.mutate(note);
              }}
            >
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#d6ff00]">
                  Note (optional)
                </span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={120}
                  placeholder="Why do they keep the chain warm?"
                  className="mt-2 w-full border-[3px] border-black bg-[#fff8e7] px-3 py-2.5 text-sm font-semibold text-black outline-none"
                />
              </label>
              {endorse.error && (
                <p role="alert" className="text-xs font-bold text-[#ffe454]">
                  {endorse.error.message}
                </p>
              )}
              <button
                type="submit"
                disabled={endorse.isPending || !myUsername?.username}
                className="neo-button flex w-full items-center justify-center gap-2 bg-[#ff4cbd] px-4 py-3 text-xs font-black uppercase text-black disabled:opacity-40"
              >
                {endorse.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 stroke-[3]" />
                )}
                {myUsername?.username
                  ? `Endorse @${username} · spend CKB`
                  : 'Claim your @handle first'}
              </button>
            </form>
          )}
        </section>
      </div>

      <section className="mt-6 neo-card bg-[#fff8e7] p-5">
        <h2 className="font-poster text-2xl uppercase leading-none">
          Endorsements ({endorsements.data?.length ?? 0})
        </h2>
        {endorsements.isLoading ? (
          <div className="mt-4 h-24 animate-pulse border-2 border-black bg-[#ffe454]" />
        ) : !endorsements.data?.length ? (
          <p className="mt-3 text-sm font-semibold">No on-chain endorsements yet. Be the first.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {endorsements.data.map((item) => (
              <li
                key={`${item.cellOutpoint.txHash}:${item.cellOutpoint.index}`}
                className="border-[3px] border-black bg-white p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/u/${item.endorserUsername}`}
                    className="text-sm font-black uppercase underline decoration-2"
                  >
                    @{item.endorserUsername}
                  </Link>
                  <span className="font-mono text-[10px] font-bold text-black/55">
                    {item.capacityCkb} CKB ·{' '}
                    {formatDistanceToNow(new Date(item.at), { addSuffix: true })}
                  </span>
                </div>
                {item.note && (
                  <p className="mt-2 text-sm font-semibold leading-relaxed">{item.note}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
