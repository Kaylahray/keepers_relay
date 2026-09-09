'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Handshake, Loader2, Sparkles } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { ProfileShareLink } from '@/components/ProfileShareLink';
import { HeroStage } from '@/components/arena/HeroStage';
import { usePublicProfile } from '@/hooks/usePublicProfile';
import { useEndorseUser, useEndorsements } from '@/hooks/useEndorsement';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';
import { registryConfigured } from '@/lib/registry/config';
import { estimateEndorsementCapacityCkb } from '@/lib/registry/endorsement';
import { normalizeUsername } from '@/lib/registry/encoding';
import type { CharacterId } from '@/lib/characters';

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
        backHref="/events"
      />
    );
  }

  if (publicProfile.isLoading) {
    return (
      <PageShell eyebrow="Public profile" title={`@${username}`} backHref="/events">
        <div className="h-64 animate-pulse rounded-2xl bg-white/5" />
      </PageShell>
    );
  }

  if (!found) {
    return (
      <PageShell
        eyebrow="404"
        title={`@${username}`}
        intro="No username cell for this handle."
        backHref="/events"
      >
        <Link
          href="/join"
          className="arena-cta inline-flex rounded px-4 py-3 text-xs font-bold uppercase"
        >
          Claim this handle
        </Link>
      </PageShell>
    );
  }

  const capacityHint = `~${estimateEndorsementCapacityCkb(note).toFixed(0)} CKB`;
  const characterId = (profile as { characterId?: CharacterId } | null)?.characterId;

  return (
    <PageShell
      eyebrow="Public builder"
      title={profile?.name ?? `@${username}`}
      intro="What visitors see — cast, headline, endorsements. No wallet or private notices."
      backHref="/events"
      backLabel="Board"
    >
      <div className="mb-6 space-y-3">
        <ProfileShareLink username={username} />
      </div>

      <div className="mb-8">
        <HeroStage
          displayName={profile?.name ?? username}
          username={username}
          headline={profile?.headline}
          characterId={characterId}
          levelLabel="Public cast"
          spin={false}
          exportable={false}
          privateBits={
            profile?.bio ? (
              <p className="text-xs font-medium leading-relaxed text-white/65">{profile.bio}</p>
            ) : avatarUrl ? (
              <p className="text-[10px] font-bold uppercase text-white/40">
                On-chain avatar registered
              </p>
            ) : null
          }
        />
      </div>

      <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-2">
          <Handshake className="h-5 w-5 text-[#ff56f6]" />
          <h2 className="font-poster text-2xl uppercase leading-none text-white">Endorse on-chain</h2>
        </div>
        <p className="mt-2 text-xs font-medium leading-relaxed text-white/65">
          You sign a CKB tx that locks a small endorsement cell to this builder&apos;s lock. It
          costs capacity ({capacityHint} estimate) — not a free click.
        </p>

        {!isConnected ? (
          <button
            type="button"
            onClick={() => connect()}
            className="arena-cta mt-4 rounded px-4 py-3 text-xs font-bold uppercase"
          >
            Connect wallet
          </button>
        ) : isSelf ? (
          <p className="mt-4 rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-white/70">
            This is your public page — share the link so others can endorse you. Private passport:{' '}
            <Link href="/profile/me" className="text-[#ff56f6] underline">
              /profile/me
            </Link>
          </p>
        ) : alreadyEndorsed ? (
          <p className="mt-4 rounded-lg border border-[#ff56f6]/40 bg-[#ff56f6]/15 px-3 py-2 text-xs font-bold uppercase text-white">
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
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                Note (optional)
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={120}
                placeholder="Why do they keep the chain warm?"
                className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm font-medium text-white outline-none placeholder:text-white/35"
              />
            </label>
            {endorse.error && (
              <p role="alert" className="text-xs font-bold text-[#ff56f6]">
                {endorse.error.message}
              </p>
            )}
            <button
              type="submit"
              disabled={endorse.isPending || !myUsername?.username}
              className="arena-cta flex w-full items-center justify-center gap-2 rounded px-4 py-3 text-xs font-bold uppercase disabled:opacity-40"
            >
              {endorse.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {myUsername?.username
                ? `Endorse @${username} · spend CKB`
                : 'Claim your @handle first'}
            </button>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="font-poster text-2xl uppercase leading-none text-white">
          Endorsements ({endorsements.data?.length ?? 0})
        </h2>
        {endorsements.isLoading ? (
          <div className="mt-4 h-24 animate-pulse rounded-xl bg-white/5" />
        ) : !endorsements.data?.length ? (
          <p className="mt-3 text-sm font-medium text-white/55">
            No on-chain endorsements yet. Be the first.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {endorsements.data.map((item) => (
              <li
                key={`${item.cellOutpoint.txHash}:${item.cellOutpoint.index}`}
                className="rounded-xl border border-white/10 bg-black/20 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/u/${item.endorserUsername}`}
                    className="text-sm font-bold uppercase text-[#ff56f6] underline decoration-2"
                  >
                    @{item.endorserUsername}
                  </Link>
                  <span className="font-mono text-[10px] font-bold text-white/45">
                    {item.capacityCkb} CKB ·{' '}
                    {formatDistanceToNow(new Date(item.at), { addSuffix: true })}
                  </span>
                </div>
                {item.note && (
                  <p className="mt-2 text-sm font-medium leading-relaxed text-white/75">
                    {item.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
