'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  ExternalLink,
  Hourglass,
  Loader2,
  Play,
  Send,
  Trophy,
} from 'lucide-react';
import { useRelayDetail } from '@/hooks/useRelayDetail';
import { PageShell } from '@/components/PageShell';
import { RelayStatusBadge } from '@/components/RelayStatusBadge';
import type { RelayAttemptStatus } from '@/types/keeper';

const STEPS = ['Read', 'Do it', 'Prove', 'Review', 'Claim'] as const;

const STEP_INDEX: Record<RelayAttemptStatus, number> = {
  not_started: 0,
  started: 1,
  submitted: 3,
  verified: 4,
  claimed: 5,
  rejected: 2,
};

export function RelayDetailView({ relayId }: { relayId: string }) {
  const { detail, start, submit, claim } = useRelayDetail(relayId);
  const [proof, setProof] = useState('');

  if (detail.isLoading) {
    return (
      <PageShell eyebrow="CKB relay" title="Loading relay" backHref="/relays" backLabel="All relays">
        <div className="h-64 animate-pulse border-[3px] border-black bg-[#ff4cbd]" />
      </PageShell>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <PageShell
        eyebrow="CKB relay"
        title="Relay not found"
        intro="This mission is no longer available. It may have been retired by its partner."
        backHref="/relays"
        backLabel="All relays"
      >
        <Link
          href="/relays"
          className="neo-button inline-block bg-[#224cff] px-4 py-3 text-sm font-black uppercase text-[#fff8e7]"
        >
          Browse relays
        </Link>
      </PageShell>
    );
  }

  const { relay, attempt, isActive } = detail.data;
  const step = STEP_INDEX[attempt.status];
  const submitError = submit.error?.message ?? null;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!proof.trim() || submit.isPending) return;
    submit.mutate(proof, { onSuccess: () => setProof('') });
  }

  return (
    <PageShell
      eyebrow={`${relay.partner} · ${relay.category} · ${relay.estimatedMinutes} min`}
      title={relay.title}
      intro={relay.description}
      backHref="/relays"
      backLabel="All relays"
    >
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <RelayStatusBadge status={attempt.status} />
        {isActive && (
          <span className="border-2 border-black bg-[#ff4cbd] px-2 py-1 text-[10px] font-black uppercase">
            Live mission
          </span>
        )}
        <span className="flex items-center gap-1.5 border-2 border-black bg-[#d6ff00] px-2 py-1 text-[10px] font-black uppercase">
          <Trophy className="h-3.5 w-3.5 stroke-[3]" />+{relay.rewardXp} XP · {relay.rewardLabel}
        </span>
      </div>

      <ol className="mb-7 flex flex-wrap gap-2" aria-label="Relay progress">
        {STEPS.map((label, i) => {
          const done = step > i;
          const current = step === i;
          return (
            <li
              key={label}
              aria-current={current ? 'step' : undefined}
              className={`flex items-center gap-1.5 border-[3px] border-black px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider ${
                done ? 'bg-black text-[#d6ff00]' : current ? 'bg-[#d6ff00]' : 'bg-[#fff8e7] text-black/50'
              }`}
            >
              {done ? <Check className="h-3 w-3 stroke-[4]" /> : <span>{i + 1}</span>}
              {label}
            </li>
          );
        })}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <section className="neo-card bg-[#fff8e7] p-5">
            <h2 className="font-poster text-2xl uppercase leading-none">Why this matters</h2>
            <p className="mt-3 text-sm font-semibold leading-relaxed">{relay.intent}</p>
          </section>

          <section className="neo-card bg-[#ffe454] p-5">
            <h2 className="font-poster text-2xl uppercase leading-none">What counts as done</h2>
            <ol className="mt-4 space-y-3">
              {relay.instructions.map((instruction, i) => (
                <li key={instruction} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center border-[3px] border-black bg-[#fff8e7] font-mono text-[11px] font-bold">
                    {i + 1}
                  </span>
                  <p className="pt-1 text-sm font-semibold leading-relaxed">{instruction}</p>
                </li>
              ))}
            </ol>
            <p className="mt-4 border-t-2 border-black pt-3 text-xs font-bold">
              Eligibility: {relay.eligibility}
            </p>
            <a
              href={relay.partnerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="neo-button mt-4 inline-flex items-center gap-2 bg-black px-4 py-2.5 text-xs font-black uppercase text-[#fff8e7]"
            >
              <ExternalLink className="h-4 w-4 stroke-[3]" />
              Open {relay.partner}
            </a>
          </section>
        </div>

        <section className="neo-card h-fit bg-[#224cff] p-5 text-[#fff8e7]">
          <h2 className="font-poster text-2xl uppercase leading-none">Your proof</h2>
          <p className="mt-2 text-xs font-bold uppercase tracking-wider text-[#d6ff00]">
            {relay.reviewMode === 'manual' ? 'Community reviewed' : 'Automated check'}
          </p>

          {attempt.status === 'not_started' && (
            <div className="mt-5">
              <p className="text-sm font-semibold leading-relaxed">
                Start the relay, then submit your proof.
              </p>
              <button
                type="button"
                onClick={() => start.mutate()}
                disabled={start.isPending}
                className="neo-button mt-4 flex w-full items-center justify-center gap-2 bg-[#d6ff00] px-4 py-3 text-sm font-black uppercase text-black disabled:opacity-50"
              >
                {start.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 stroke-[3]" />
                )}
                Start relay
              </button>
            </div>
          )}

          {(attempt.status === 'started' || attempt.status === 'rejected') && (
            <form onSubmit={handleSubmit} className="mt-5">
              <label
                htmlFor="proof"
                className="block text-[10px] font-black uppercase tracking-[0.16em] text-[#d6ff00]"
              >
                {relay.proofLabel}
              </label>
              {relay.proofType === 'note' ? (
                <textarea
                  id="proof"
                  value={proof}
                  onChange={(event) => setProof(event.target.value)}
                  placeholder={relay.proofPlaceholder}
                  className="mt-2 min-h-32 w-full resize-none border-[3px] border-black bg-[#fff8e7] p-3 text-sm font-semibold text-black outline-none placeholder:text-black/40 focus:bg-white"
                />
              ) : (
                <input
                  id="proof"
                  value={proof}
                  onChange={(event) => setProof(event.target.value)}
                  placeholder={relay.proofPlaceholder}
                  className="mt-2 w-full border-[3px] border-black bg-[#fff8e7] px-3 py-3 text-sm font-semibold text-black outline-none placeholder:text-black/40 focus:bg-white"
                />
              )}
              {submitError && (
                <p role="alert" className="mt-2 text-xs font-bold text-[#ffe454]">
                  {submitError}
                </p>
              )}
              <button
                type="submit"
                disabled={!proof.trim() || submit.isPending}
                className="neo-button mt-4 flex w-full items-center justify-center gap-2 bg-[#d6ff00] px-4 py-3 text-sm font-black uppercase text-black disabled:opacity-50"
              >
                {submit.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 stroke-[3]" />
                )}
                Submit proof
              </button>
            </form>
          )}

          {attempt.status === 'submitted' && (
            <div className="mt-5 border-[3px] border-black bg-[#ff6b2d] p-4 text-black">
              <div className="flex items-center gap-2">
                <Hourglass className="h-5 w-5 animate-pulse stroke-[3]" />
                <p className="font-poster text-xl uppercase leading-none">In review</p>
              </div>
              <p className="mt-3 text-sm font-semibold leading-relaxed">{attempt.reviewerNote}</p>
              <p className="mt-3 font-mono text-[10px] font-bold uppercase">
                This page updates itself when the result lands.
              </p>
            </div>
          )}

          {attempt.status === 'verified' && (
            <div className="mt-5">
              <div className="border-[3px] border-black bg-[#d6ff00] p-4 text-black">
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-5 w-5 stroke-[3]" />
                  <p className="font-poster text-xl uppercase leading-none">Verified</p>
                </div>
                <p className="mt-2 text-sm font-semibold">{attempt.reviewerNote}</p>
              </div>
              <button
                type="button"
                onClick={() => claim.mutate()}
                disabled={claim.isPending}
                className="neo-button mt-4 flex w-full items-center justify-center gap-2 bg-[#ff4cbd] px-4 py-3 text-sm font-black uppercase text-black disabled:opacity-50"
              >
                {claim.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trophy className="h-4 w-4 stroke-[3]" />
                )}
                Claim +{relay.rewardXp} XP
              </button>
            </div>
          )}

          {attempt.status === 'claimed' && (
            <div className="mt-5 border-[3px] border-black bg-[#fff8e7] p-4 text-black">
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-5 w-5 stroke-[3]" />
                <p className="font-poster text-xl uppercase leading-none">Receipt</p>
              </div>
              <dl className="mt-3 space-y-1.5 font-mono text-[11px] font-bold">
                <Row term="Reward" value={`+${relay.rewardXp} XP`} />
                <Row term="Badge" value={relay.rewardLabel} />
                <Row
                  term="Claimed"
                  value={
                    attempt.claimedAt ? new Date(attempt.claimedAt).toLocaleString() : '—'
                  }
                />
              </dl>
              <Link
                href="/profile/me"
                className="neo-button mt-4 flex items-center justify-center gap-1.5 bg-[#224cff] px-4 py-2.5 text-xs font-black uppercase text-[#fff8e7]"
              >
                See it on your passport
                <ArrowUpRight className="h-3.5 w-3.5 stroke-[3]" />
              </Link>
            </div>
          )}

          {attempt.proof && attempt.status !== 'started' && (
            <div className="mt-5 border-t-2 border-[#fff8e7] pt-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-[#d6ff00]">
                Submitted proof
              </p>
              <p className="mt-2 break-words font-mono text-[11px] leading-relaxed">
                {attempt.proof}
              </p>
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="uppercase text-black/60">{term}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
