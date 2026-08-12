'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ChevronDown,
  Home,
  Send,
} from 'lucide-react';
import {
  useChainQuery,
  usePassChain,
  useSelectJourney,
} from '@/hooks/useChain';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useWallet } from '@/hooks/useWallet';
import { useUsername } from '@/hooks/useUsername';
import { useCountdown } from '@/hooks/useCountdown';
import { ChainOrb } from '@/components/ChainOrb';
import { Countdown, urgencyState } from '@/components/Countdown';
import { LineageList } from '@/components/LineageList';
import { PassChainDialog } from '@/components/PassChainDialog';
import { DeadOverlay } from '@/components/DeadOverlay';
import { KeeperExperience } from '@/components/KeeperExperience';
import { JourneyCard } from '@/components/JourneyCard';
import { ContributeRitual } from '@/components/ContributeRitual';
import { JourneySwitcher } from '@/components/JourneySwitcher';
import { HandoffPanel } from '@/components/HandoffPanel';
import { InviteButton } from '@/components/InviteButton';
import { useKeeperEcosystem } from '@/hooks/useKeeperEcosystem';
import { useCommunitiesQuery } from '@/hooks/useCommunity';
import {
  CREATURE_STAGE_LABEL,
  creatureStageForHolders,
} from '@/types/chain';

export function ChainLetter({ journeyId }: { journeyId?: string }) {
  const { data: chain, isLoading, isError, refetch } = useChainQuery();
  const select = useSelectJourney();

  useEffect(() => {
    if (journeyId) select.mutate(journeyId);
    // Load this room's Cell once when the URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyId]);
  const passChain = usePassChain();
  const { isConnected, connect } = useWallet();
  const myBuilder = useMyBuilder();
  const me = myBuilder.data?.builder;
  const { username: onChainUsername } = useUsername();
  const communities = useCommunitiesQuery();
  const ecosystem = useKeeperEcosystem();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nominatedRecipient, setNominatedRecipient] = useState('');

  const windowMs = (chain?.windowHours ?? 24) * 60 * 60 * 1000;
  const countdown = useCountdown(chain?.expiresAt, {
    windowMs,
    paused: chain?.status === 'dead' || chain?.status === 'returned',
  });

  useEffect(() => {
    if (chain?.status === 'alive' && countdown.isExpired) refetch();
  }, [chain?.status, countdown.isExpired, refetch]);

  const returned = chain?.status === 'returned';
  const dead =
    chain?.status === 'dead' || (chain?.status === 'alive' && countdown.isExpired);
  const orbState = useMemo(
    () => urgencyState(countdown.fractionElapsed, Boolean(dead)),
    [countdown.fractionElapsed, dead],
  );
  const currentOwner = chain?.owners[chain.owners.length - 1];
  const hasContributedThisTurn = Boolean(currentOwner?.contributionId);
  const isHolder =
    !!me?.onboarded &&
    !!currentOwner &&
    me.displayName.toLowerCase() === currentOwner.name.toLowerCase() &&
    !dead &&
    !returned;
  const holderNumber = chain?.owners.length ?? 0;
  const stage = chain ? creatureStageForHolders(chain.owners.length) : 'blob';
  const cities = Array.from(
    new Set(
      (chain?.owners.map((o) => o.city).filter(Boolean) ?? []) as string[],
    ),
  );
  const timeLeftLabel = dead
    ? 'locked'
    : returned
      ? 'home'
      : `${countdown.hours}h ${countdown.minutes}m left`;
  const room = communities.data?.find((c) => c.id === chain?.communityId);

  function handleSubmit(recipient: string, city: string) {
    if (!chain) return;
    passChain.mutate(
      { recipient, city: city.trim() || undefined, chain },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setNominatedRecipient('');
        },
      },
    );
  }

  function openHandoff(recipient = '') {
    setNominatedRecipient(recipient);
    setDialogOpen(true);
  }

  if (isLoading || !chain) {
    return (
      <div className="flex min-h-[70vh] w-full items-center justify-center bg-[#101010]">
        <motion.div
          className="h-14 w-14 border-[5px] border-[#d6ff00] bg-[#ff4cbd]"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[70vh] w-full flex-col items-center justify-center gap-4 bg-[#101010] p-6 text-center text-[#fff8e7]">
        <AlertTriangle className="h-10 w-10 stroke-[3] text-[#ff4cbd]" />
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

  const primaryCta = (() => {
    if (dead) return { label: 'Cell locked forever', action: null as (() => void) | null, disabled: true };
    if (returned)
      return { label: 'Journey complete', action: null, disabled: true };
    if (isHolder && !hasContributedThisTurn)
      return {
        label: 'Scroll to seal your mark',
        action: () =>
          document.getElementById('contribute-ritual')?.scrollIntoView({ behavior: 'smooth' }),
        disabled: false,
      };
    if (isHolder && hasContributedThisTurn)
      return { label: 'Pass it on', action: () => openHandoff(), disabled: false };
    if (!isConnected)
      return { label: 'Connect to join', action: () => connect(), disabled: false };
    if (isConnected && !me?.onboarded)
      return {
        label: onChainUsername?.username
          ? `Continue as @${onChainUsername.username}`
          : 'Join',
        action: null,
        disabled: true,
      };
    return {
      label: 'Watching · see the trail',
      action: () =>
        document.getElementById('journey-trail')?.scrollIntoView({ behavior: 'smooth' }),
      disabled: false,
    };
  })();

  return (
    <div className="relative min-h-full w-full overflow-hidden bg-[#101010] text-[#fff8e7]">
      {/* ——— Hero: one composition ——— */}
      <section className="relative min-h-[min(92vh,920px)] overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 70% 40%, #224cff55 0%, transparent 55%), radial-gradient(ellipse 50% 40% at 20% 80%, #ff4cbd33 0%, transparent 50%), linear-gradient(165deg, #0a0a0a 0%, #1a1208 45%, #101010 100%)',
          }}
          aria-hidden="true"
        />
        <div className="chain-grid pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />

        <div className="relative mx-auto flex min-h-[min(92vh,920px)] max-w-6xl flex-col justify-between px-4 pb-6 pt-4 sm:px-6">
          <div className="flex justify-end">
            <Link
              href="/how-it-works"
              className="border-2 border-[#fff8e7]/40 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#fff8e7] hover:border-[#d6ff00] hover:text-[#d6ff00]"
            >
              How it works
            </Link>
          </div>

          <div className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
            <div>
              <motion.p
                className="inline-block border-2 border-[#d6ff00] bg-[#d6ff00] px-2.5 py-1 font-mono text-[10px] font-bold text-black"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {chain.creatureName.toUpperCase()} · {CREATURE_STAGE_LABEL[stage].toUpperCase()}
              </motion.p>
              <motion.h1
                className="mt-4 font-poster text-5xl uppercase leading-[0.88] text-[#fff8e7] sm:text-6xl lg:text-7xl"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
              >
                Holder #{holderNumber}
                <br />
                <span className="text-[#ff4cbd]">{timeLeftLabel}</span>
              </motion.h1>
              <motion.p
                className="mt-5 max-w-md text-base font-semibold leading-relaxed text-[#fff8e7]/85"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.12 }}
              >
                {chain.seedPrompt} One holder. One mark. Pass it — or this lineage dies.
              </motion.p>

              {cities.length > 0 && (
                <p className="mt-4 font-mono text-xs font-bold text-[#d6ff00]">
                  {cities.join(' → ')}
                </p>
              )}

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={primaryCta.disabled || !primaryCta.action}
                  onClick={() => primaryCta.action?.()}
                  className="neo-button flex items-center gap-2 bg-[#d6ff00] px-5 py-3.5 text-sm font-black uppercase text-black disabled:opacity-40"
                >
                  <Send className="h-4 w-4 stroke-[3]" />
                  {primaryCta.label}
                </button>
                {isHolder && hasContributedThisTurn && (
                  <button
                    type="button"
                    onClick={() => openHandoff(chain.creatorName)}
                    className="flex items-center gap-2 border-2 border-[#fff8e7] px-4 py-3 text-xs font-black uppercase"
                  >
                    <Home className="h-4 w-4 stroke-[3]" />
                    Send home to {chain.creatorName}
                  </button>
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider">
                <span className="border border-[#fff8e7]/30 px-2 py-1">
                  Held by {currentOwner?.name}
                  {currentOwner?.city ? ` · ${currentOwner.city}` : ''}
                </span>
                <span className="border border-[#fff8e7]/30 px-2 py-1">
                  {chain.mode === 'return_home' ? `Return to ${chain.creatorName}` : 'Open streak'}
                </span>
                <span className="border border-[#d6ff00] px-2 py-1 text-[#d6ff00]">
                  Pot · {chain.rewardPoolProof} PROOF
                </span>
                {chain.genesisTxHash ? (
                  <a
                    href={`https://pudge.explorer.nervos.org/transaction/${chain.lastTxHash ?? chain.genesisTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="border border-[#d6ff00] px-2 py-1 text-[#d6ff00]"
                  >
                    On-chain Cell
                  </a>
                ) : null}
                {isHolder && (
                  <span className="border-2 border-[#d6ff00] bg-[#d6ff00] px-2 py-1 text-black">
                    You hold it
                  </span>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                {room ? (
                  <Link
                    href={`/communities/${room.slug}`}
                    className="border-2 border-[#d6ff00] px-3 py-2 text-[10px] font-black uppercase text-[#d6ff00]"
                  >
                    Room · {room.name}
                  </Link>
                ) : null}
                <InviteButton
                  url={
                    room?.slug
                      ? `/communities/${room.slug}?invite=1`
                      : '/communities?invite=1'
                  }
                  title={`Keep ${chain.creatureName} alive`}
                  text={`Keep ${chain.creatureName} alive on Keepers Relay.`}
                />
                <Link
                  href="/communities"
                  className="text-[10px] font-black uppercase tracking-wider text-[#d6ff00] underline-offset-2 hover:underline"
                >
                  Browse communities →
                </Link>
              </div>
            </div>

            <motion.div
              className="flex flex-col items-center"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 120 }}
            >
              <ChainOrb
                state={orbState}
                cellHash={currentOwner?.cellHash}
                coverImageUrl={chain.coverImageUrl}
                creatureName={chain.creatureName}
              />
              <div className="mt-8 w-full max-w-md">
                <Countdown countdown={countdown} dead={Boolean(dead) || Boolean(returned)} />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {room && !room.isMember && !isHolder && (
        <section className="border-t-[3px] border-black bg-[#ffe454] px-4 py-4 text-black sm:px-6">
          <p className="mx-auto max-w-5xl text-sm font-semibold">
            Join{' '}
            <Link href={`/communities/${room.slug}`} className="font-black uppercase underline">
              {room.name}
            </Link>{' '}
            to hold or pass this Cell.
          </p>
        </section>
      )}

      {/* ——— Holder ritual ——— */}
      {isHolder && (
        <section id="contribute-ritual" className="border-t-[3px] border-black bg-[#fff8e7] px-4 py-10 text-black sm:px-6">
          <div className="mx-auto max-w-xl">
            <ContributeRitual
              seedPrompt={chain.seedPrompt}
              alreadySealed={hasContributedThisTurn}
              publishing={ecosystem.publish.isPending}
              error={ecosystem.publish.error?.message ?? null}
              onPublish={(input) => ecosystem.publish.mutate(input)}
            />
            {hasContributedThisTurn && (
              <button
                type="button"
                onClick={() => openHandoff()}
                className="neo-button mt-4 flex w-full items-center justify-center gap-2 bg-[#224cff] px-4 py-3.5 text-sm font-black uppercase text-[#fff8e7]"
              >
                <Send className="h-4 w-4 stroke-[3]" />
                Pass {chain.creatureName}
              </button>
            )}
          </div>
        </section>
      )}

      {/* ——— Journey trail ——— */}
      <section
        id="journey-trail"
        className="border-t-[3px] border-black bg-[#ffe454] px-4 py-12 text-black sm:px-6"
      >
        <div className="mx-auto max-w-6xl space-y-6">
          <JourneySwitcher activeId={chain.id} />
          {me?.onboarded && !dead && !returned && (
            <HandoffPanel
              journeyId={chain.id}
              isHolder={isHolder}
              canRequest={Boolean(
                communities.data?.some(
                  (c) => c.id === chain.communityId && c.isMember,
                ),
              )}
            />
          )}
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em]">The trail</p>
            <h2 className="mt-2 font-poster text-4xl uppercase leading-none sm:text-5xl">
              What {holderNumber} people made of it
            </h2>
            <p className="mt-3 max-w-xl text-sm font-semibold">
              The Cell gets better after every touch — not worse. That&rsquo;s the point.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <JourneyCard chain={chain} artifact={ecosystem.artifact.data ?? null} />
            <div className="border-[3px] border-black bg-[#fff8e7] p-5">
              <div className="flex items-baseline justify-between border-b-[3px] border-black pb-3">
                <h3 className="font-poster text-2xl uppercase leading-none">Lineage</h3>
                <span className="font-mono text-[10px] font-bold">NEWEST FIRST</span>
              </div>
              <div className="mt-2 max-h-[420px] overflow-y-auto pr-1">
                <LineageList owners={chain.owners} dead={Boolean(dead)} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ——— Secondary builder layer ——— */}
      <details className="group border-t-[3px] border-black bg-[#fff8e7] text-black">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <span className="flex items-center gap-2">
            <ChevronDown className="h-5 w-5 stroke-[3] transition group-open:rotate-180" />
            <span>
              <span className="font-poster text-2xl uppercase leading-none">
                Relays · Passport · Queue
              </span>
            </span>
          </span>
        </summary>
        <div className="border-t-[3px] border-black bg-[#d6ff00]/30">
          <KeeperExperience
            currentOwner={currentOwner?.name ?? ''}
            chainAlive={!dead && !returned}
            chainId={chain.id}
            seedPrompt={chain.seedPrompt}
            hasContributedThisTurn={hasContributedThisTurn}
            coverImageUrl={chain.coverImageUrl}
            creatureName={chain.creatureName}
            onChooseNext={openHandoff}
            compact
          />
        </div>
      </details>

      <PassChainDialog
        open={dialogOpen}
        fromName={currentOwner?.name ?? ''}
        initialRecipient={nominatedRecipient}
        isPending={passChain.isPending}
        error={passChain.error ? passChain.error.message : null}
        mode={chain.mode}
        creatorName={chain.creatorName}
        creatureName={chain.creatureName}
        canPass={hasContributedThisTurn && !dead && !returned}
        contributionHint="Leave your mark first."
        onClose={() => {
          setDialogOpen(false);
          setNominatedRecipient('');
        }}
        onSubmit={handleSubmit}
      />

      {returned && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto max-w-lg px-4">
          <div className="border-[4px] border-black bg-[#d6ff00] p-4 text-center text-black shadow-[8px_8px_0_#101010]">
            <p className="text-[10px] font-black uppercase tracking-wider">Journey complete</p>
            <p className="mt-1 font-poster text-2xl uppercase leading-none">
              {chain.creatureName} came home to {chain.creatorName}
            </p>
            <p className="mt-2 text-xs font-semibold">
              {chain.owners.length} holders · sealed as a living artefact.
            </p>
          </div>
        </div>
      )}

      <DeadOverlay
        open={Boolean(dead)}
        ownerCount={chain.owners.length}
        lastOwner={currentOwner?.name ?? ''}
      />
    </div>
  );
}
