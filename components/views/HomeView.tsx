'use client';

import Link from 'next/link';
import { ArrowRight, UsersRound } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { useUsername } from '@/hooks/useUsername';
import { useMyBuilder } from '@/hooks/useBuilder';

const STEPS = [
  {
    n: '01',
    title: 'Join a room',
    body: 'Communities hold the living Cells. Pick one — or start your own.',
  },
  {
    n: '02',
    title: 'Hold it. Leave a mark.',
    body: 'One person holds a streak at a time. Seal a contribution before the window ends.',
  },
  {
    n: '03',
    title: 'Pass it on',
    body: 'Handoff is a CKB transaction. Pass to an @handle or a ckt address.',
  },
];

export function HomeView() {
  const { isConnected, connect } = useWallet();
  const { username } = useUsername();
  const me = useMyBuilder().data?.builder;
  const hasHandle = Boolean(username?.username || me?.onboarded);

  return (
    <div className="relative min-h-full w-full overflow-hidden bg-[#d6ff00]">
      <div className="chain-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-5xl px-3 pb-20 pt-8 sm:px-6">
        <section className="border-[3px] border-black bg-black p-6 text-[#fff8e7] shadow-[10px_10px_0_#ff4cbd] sm:p-9">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#d6ff00]">
            Keepers Relay
          </p>
          <h1 className="mt-3 font-poster text-5xl uppercase leading-[.82] sm:text-7xl">
            One Cell.
            <br />
            One mark.
            <br />
            Pass it on.
          </h1>
          <p className="mt-5 max-w-2xl text-sm font-semibold leading-relaxed sm:text-base">
            A living CKB collectible. The clock, the holder, and the handoff live inside
            communities.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/communities"
              className="neo-button inline-flex items-center gap-2 bg-[#d6ff00] px-4 py-3 text-xs font-black uppercase text-black"
            >
              <UsersRound className="h-4 w-4 stroke-[3]" />
              Enter communities
            </Link>
            {!isConnected ? (
              <button
                type="button"
                onClick={() => connect()}
                className="neo-button bg-[#224cff] px-4 py-3 text-xs font-black uppercase text-[#fff8e7]"
              >
                Connect wallet
              </button>
            ) : hasHandle ? (
              <Link
                href="/streaks"
                className="neo-button bg-[#fff8e7] px-4 py-3 text-xs font-black uppercase text-black"
              >
                Live streaks
              </Link>
            ) : (
              <Link
                href="/join"
                className="neo-button inline-flex items-center gap-2 bg-[#224cff] px-4 py-3 text-xs font-black uppercase text-[#fff8e7]"
              >
                Claim @handle
                <ArrowRight className="h-4 w-4 stroke-[3]" />
              </Link>
            )}
          </div>
        </section>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step) => (
            <section key={step.n} className="neo-card bg-[#fff8e7] p-5">
              <span className="inline-block border-2 border-black bg-[#ffe454] px-2 py-1 font-mono text-[10px] font-bold">
                {step.n}
              </span>
              <h2 className="mt-3 font-poster text-2xl uppercase leading-[.95]">{step.title}</h2>
              <p className="mt-3 text-sm font-semibold leading-relaxed">{step.body}</p>
            </section>
          ))}
        </div>

        <Link
          href="/streaks"
          className="mt-8 inline-flex items-center gap-2 text-xs font-black uppercase underline"
        >
          See every live streak
          <ArrowRight className="h-3.5 w-3.5 stroke-[3]" />
        </Link>
      </div>
    </div>
  );
}
