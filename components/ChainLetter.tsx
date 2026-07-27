'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Send, Zap } from 'lucide-react';
import {
  useChainQuery,
  useFastForward,
  usePassChain,
  useResetChain,
} from '@/hooks/useChain';
import { useCountdown } from '@/hooks/useCountdown';
import { Header } from '@/components/Header';
import { ChainOrb } from '@/components/ChainOrb';
import { Countdown, urgencyState } from '@/components/Countdown';
import { LineageList } from '@/components/LineageList';
import { StatsBar } from '@/components/StatsBar';
import { PassChainDialog } from '@/components/PassChainDialog';
import { DeadOverlay } from '@/components/DeadOverlay';
import { KeeperExperience } from '@/components/KeeperExperience';

const KEEPER_POSTER_URL =
  'https://cdn.magicpatterns.com/patterns/generated-images/3053a4f3-7d99-4ab2-bb08-858cff8196f0.jpg';

export function ChainLetter() {
  const { data: chain, isLoading, isError, refetch } = useChainQuery();
  const passChain = usePassChain();
  const resetChain = useResetChain();
  const fastForward = useFastForward();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nominatedRecipient, setNominatedRecipient] = useState('');

  const windowMs = (chain?.windowHours ?? 24) * 60 * 60 * 1000;
  const countdown = useCountdown(chain?.expiresAt, {
    windowMs,
    paused: chain?.status === 'dead',
  });

  useEffect(() => {
    if (chain?.status === 'alive' && countdown.isExpired) refetch();
  }, [chain?.status, countdown.isExpired, refetch]);

  const dead = chain?.status === 'dead' || (chain?.status === 'alive' && countdown.isExpired);
  const orbState = useMemo(
    () => urgencyState(countdown.fractionElapsed, Boolean(dead)),
    [countdown.fractionElapsed, dead],
  );
  const currentOwner = chain?.owners[chain.owners.length - 1];

  function handleSubmit(recipient: string) {
    passChain.mutate(recipient, {
      onSuccess: () => {
        setDialogOpen(false);
        setNominatedRecipient('');
      },
    });
  }

  function openHandoff(recipient = '') {
    setNominatedRecipient(recipient);
    setDialogOpen(true);
  }

  if (isLoading || !chain) {
    return (
      <div className="bg-relic flex min-h-full w-full items-center justify-center">
        <motion.div
          className="h-14 w-14 border-[5px] border-black bg-[#ff4cbd]"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-relic flex min-h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle className="h-10 w-10 stroke-[3]" />
        <p className="font-poster text-3xl uppercase">We lost the signal.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="neo-button bg-[#224cff] px-4 py-2 text-sm font-black text-[#fff8e7]"
        >
          TRY AGAIN
        </button>
      </div>
    );
  }

  return (
    <div className="bg-relic relative min-h-full w-full overflow-hidden">
      <div className="chain-grid pointer-events-none absolute inset-0 opacity-100" aria-hidden="true" />
      <div className="relative mx-auto flex max-w-6xl flex-col">
        <Header chainId={chain.id} ownerCount={chain.owners.length} />
        <main className="grid grid-cols-1 gap-8 px-3 pb-12 pt-8 sm:px-6 lg:grid-cols-[1.12fr_.88fr] lg:gap-10">
          <section className="flex flex-col items-center">
            <div className="relative w-full max-w-lg border-[3px] border-black bg-[#fff8e7] p-4 shadow-[8px_8px_0_#224cff]">
              <div className="grid items-center gap-4 sm:grid-cols-[1fr_.9fr]">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em]">
                    One Cell. One big obligation.
                  </p>
                  <h1 className="mt-2 font-poster text-5xl uppercase leading-[.82] sm:text-6xl">
                    Don&rsquo;t
                    <br />
                    break
                    <br />
                    <span className="text-[#ff4cbd]">the chain.</span>
                  </h1>
                  <p className="mt-4 text-sm font-semibold leading-relaxed">
                    A Keeper has one window to make culture, move CKB forward, and pass the Cell to
                    someone who&rsquo;ll do the same.
                  </p>
                </div>
                <div className="relative rotate-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={KEEPER_POSTER_URL}
                    alt="Chrome hand carrying a glowing Keeper Cell"
                    className="neo-image h-52 w-full object-cover"
                  />
                  <span className="absolute -bottom-3 -left-3 border-2 border-black bg-[#d6ff00] px-2 py-1 font-mono text-[10px] font-bold">
                    KEEPER PASS
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-10">
              <ChainOrb state={orbState} cellHash={currentOwner?.cellHash} />
            </div>
            <div className="mt-10 w-full max-w-lg">
              <Countdown countdown={countdown} dead={Boolean(dead)} />
            </div>
            <div className="mt-6 flex w-full max-w-lg items-center justify-between border-[3px] border-black bg-[#ff4cbd] p-4 shadow-[6px_6px_0_#101010]">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em]">Current Keeper</p>
                <p className="mt-1 font-poster text-3xl uppercase leading-none">
                  {currentOwner?.name}
                </p>
              </div>
              <span className="border-2 border-black bg-[#d6ff00] px-2 py-1 font-mono text-[10px] font-bold">
                THEIR MOVE
              </span>
            </div>
            <button
              type="button"
              onClick={() => openHandoff()}
              disabled={Boolean(dead)}
              className="neo-button mt-5 flex w-full max-w-lg items-center justify-center gap-2 bg-[#224cff] px-5 py-4 text-sm font-black uppercase text-[#fff8e7] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-5 w-5 stroke-[3]" />
              {dead ? 'CELL LOCKED FOREVER' : 'PASS THE BATON'}
            </button>
            {!dead && (
              <button
                type="button"
                onClick={() => fastForward.mutate()}
                className="mt-4 border-2 border-black bg-[#ffe454] px-3 py-2 text-[10px] font-black uppercase hover:bg-[#ff4cbd]"
              >
                <Zap className="mr-1 inline h-3.5 w-3.5 stroke-[3]" />
                DEMO: MAKE IT URGENT
              </button>
            )}
          </section>
          <section className="flex flex-col gap-7">
            <StatsBar
              ownerCount={chain.owners.length}
              trophyGoal={chain.trophyGoal}
              windowHours={chain.windowHours}
              dead={Boolean(dead)}
            />
            <div className="neo-card bg-[#fff8e7] p-5 text-black">
              <div className="flex items-baseline justify-between border-b-[3px] border-black pb-3">
                <h2 className="font-poster text-3xl uppercase leading-none">The lineage</h2>
                <span className="font-mono text-[10px] font-bold">NEWEST FIRST</span>
              </div>
              <div className="mt-2 max-h-[470px] overflow-y-auto pr-1">
                <LineageList owners={chain.owners} dead={Boolean(dead)} />
              </div>
            </div>
          </section>
        </main>
        <KeeperExperience
          currentOwner={currentOwner?.name ?? ''}
          chainAlive={!dead}
          onChooseNext={openHandoff}
        />
      </div>
      <PassChainDialog
        open={dialogOpen}
        fromName={currentOwner?.name ?? ''}
        initialRecipient={nominatedRecipient}
        isPending={passChain.isPending}
        error={passChain.error ? passChain.error.message : null}
        onClose={() => {
          setDialogOpen(false);
          setNominatedRecipient('');
        }}
        onSubmit={handleSubmit}
      />
      <DeadOverlay
        open={Boolean(dead)}
        ownerCount={chain.owners.length}
        lastOwner={currentOwner?.name ?? ''}
        onReset={() => resetChain.mutate()}
        resetting={resetChain.isPending}
      />
    </div>
  );
}
