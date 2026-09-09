'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { AlertTriangle, Home, LifeBuoy, Loader2, Send } from 'lucide-react';
import {
  useChainQuery,
  usePassChain,
  useSelectJourney,
} from '@/hooks/useChain';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useCommunitiesQuery, useCommunityQuery } from '@/hooks/useCommunity';
import { useWallet } from '@/hooks/useWallet';
import { useUsername } from '@/hooks/useUsername';
import { useCountdown } from '@/hooks/useCountdown';
import { ChainOrb } from '@/components/ChainOrb';
import { Countdown, urgencyState } from '@/components/Countdown';
import { LineageList } from '@/components/LineageList';
import { PassChainDialog } from '@/components/PassChainDialog';
import { DeadOverlay } from '@/components/DeadOverlay';
import { JourneyCard } from '@/components/JourneyCard';
import { ContributeRitual } from '@/components/ContributeRitual';
import { JourneySwitcher } from '@/components/JourneySwitcher';
import { StakesPanel } from '@/components/StakesPanel';
import { KeeperFigureCarousel } from '@/components/arena/KeeperFigureCarousel';
import { HandoffPanel } from '@/components/HandoffPanel';
import { InviteButton } from '@/components/InviteButton';
import { useKeeperEcosystem } from '@/hooks/useKeeperEcosystem';
import { useDraftMark, useRescueChain, useSaveDraftMark } from '@/hooks/useHome';
import {
  CREATURE_STAGE_LABEL,
  creatureStageForHolders,
  stakesEntryAtHop,
} from '@/types/chain';
import { CRITICAL_WINDOW_MS, RESCUE_EXTEND_HOURS } from '@/types/retention';
import { formatDistanceToNow } from 'date-fns';

export function ChainLetter({ journeyId }: { journeyId?: string }) {
  const { data: chain, isLoading, isError, refetch } = useChainQuery();
  const select = useSelectJourney();

  useEffect(() => {
    if (journeyId) select.mutate(journeyId);
    // Load this room's Cell once when the URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyId]);
  const passChain = usePassChain();
  const { address, isConnected, connect } = useWallet();
  const myBuilder = useMyBuilder();
  const me = myBuilder.data?.builder;
  const { username: onChainUsername } = useUsername();
  const communities = useCommunitiesQuery();
  const ecosystem = useKeeperEcosystem();
  const draftQuery = useDraftMark(chain?.id);
  const saveDraft = useSaveDraftMark();
  const rescue = useRescueChain();
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
    !dead &&
    !returned &&
    ((!!address &&
      !!currentOwner.address &&
      address.toLowerCase() === currentOwner.address.toLowerCase()) ||
      me.displayName.toLowerCase() === currentOwner.name.toLowerCase() ||
      (!!onChainUsername?.username &&
        onChainUsername.username.toLowerCase() === currentOwner.name.toLowerCase()));
  const isNominated =
    !!me?.onboarded &&
    !!address &&
    !isHolder &&
    !dead &&
    !returned &&
    chain?.nominatedNext?.address.toLowerCase() === address.toLowerCase();
  const canDraft = isHolder || isNominated;
  const msLeft = chain ? new Date(chain.expiresAt).getTime() - Date.now() : 0;
  const isCritical =
    !!chain &&
    chain.status === 'alive' &&
    !dead &&
    !returned &&
    msLeft > 0 &&
    msLeft <= CRITICAL_WINDOW_MS;
  const room = communities.data?.find((c) => c.id === chain?.communityId);
  const roomDetail = useCommunityQuery(room?.slug ?? '');
  const passMembers = roomDetail.data?.members ?? [];
  const canRescue =
    !!me?.onboarded &&
    !!address &&
    !!room?.isMember &&
    isCritical &&
    !isHolder;
  const ageLabel = chain
    ? formatDistanceToNow(new Date(chain.owners[0]?.receivedAt ?? chain.createdAt), {
        addSuffix: false,
      })
    : undefined;
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

  function scrollToMark() {
    document.getElementById('contribute-ritual')?.scrollIntoView({ behavior: 'smooth' });
  }

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
    if (!hasContributedThisTurn) {
      scrollToMark();
      return;
    }
    setNominatedRecipient(recipient);
    setDialogOpen(true);
  }

  if (isLoading || !chain) {
    return (
      <div className="relative flex min-h-[70vh] w-full items-center justify-center overflow-hidden bg-[#0c0c12]">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(168,85,247,0.25), transparent 55%)',
          }}
          aria-hidden
        />
        <Loader2 className="relative h-8 w-8 animate-spin text-[#99ee2d]" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[70vh] w-full flex-col items-center justify-center gap-4 bg-[#0c0c12] p-6 text-center text-white">
        <AlertTriangle className="h-10 w-10 text-[#99ee2d]" />
        <p className="font-poster text-3xl uppercase">We lost the signal.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="arena-cta px-4 py-2 text-sm font-bold uppercase"
        >
          Try again
        </button>
      </div>
    );
  }

  const primaryCta = (() => {
    if (dead)
      return { label: 'This Cell is gone', action: null as (() => void) | null, disabled: true };
    if (returned) return { label: 'It made it home', action: null, disabled: true };
    if (isHolder && !hasContributedThisTurn)
      return {
        label: 'Leave your mark',
        action: () =>
          document.getElementById('contribute-ritual')?.scrollIntoView({ behavior: 'smooth' }),
        disabled: false,
      };
    if (isHolder && hasContributedThisTurn)
      return { label: 'Pass it on', action: () => openHandoff(), disabled: false };
    if (!isConnected)
      return { label: 'Connect to take part', action: () => connect(), disabled: false };
    if (isConnected && !me?.onboarded)
      return {
        label: onChainUsername?.username
          ? `Continue as @${onChainUsername.username}`
          : 'Claim a handle to hold it',
        action: null,
        disabled: true,
      };
    return {
      label: 'Watching · see the line',
      action: () =>
        document.getElementById('journey-trail')?.scrollIntoView({ behavior: 'smooth' }),
      disabled: false,
    };
  })();

  return (
    <div className="relative min-h-full w-full overflow-hidden bg-[#0c0c12] text-white">
      {/* ——— Hero: arena composition ——— */}
      <section className="relative min-h-[min(88vh,880px)] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/uismod/hero-bg.png"
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 55% at 72% 38%, rgba(168,85,247,0.32), transparent 55%), radial-gradient(ellipse 45% 35% at 18% 75%, rgba(153,238,45,0.1), transparent 50%), linear-gradient(to bottom, transparent 45%, #0c0c12 96%)',
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-20 mix-blend-overlay"
          style={{ backgroundImage: "url('/uismod/noise.png')", backgroundSize: '420px' }}
          aria-hidden
        />

        <div className="relative mx-auto flex min-h-[min(88vh,880px)] max-w-[1440px] flex-col px-5 pb-8 pt-6 sm:px-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={room ? `/communities/${room.slug}` : '/streaks'}
              className="inline-flex items-center gap-1.5 border border-white/15 bg-black/30 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/75 backdrop-blur-sm hover:bg-white/5"
            >
              ← {room ? room.name : 'Chain Cells'}
            </Link>
            <Link
              href="/how-it-works"
              className="border border-white/20 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/70 hover:border-[#99ee2d] hover:text-[#99ee2d]"
            >
              How it works
            </Link>
          </div>

          <div className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[1fr_auto_minmax(240px,300px)] lg:gap-0">
            <div className="relative z-10 max-w-xl">
              <motion.p
                className="inline-block bg-[#99ee2d] px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-[#111]"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {chain.creatureName} · {CREATURE_STAGE_LABEL[stage]}
              </motion.p>
              <motion.h1
                className="mt-4 font-poster text-[clamp(2.5rem,6vw,4.25rem)] uppercase leading-[0.9] text-white"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
              >
                Holder #{holderNumber}
                <br />
                <span className="text-[#99ee2d]">{timeLeftLabel}</span>
              </motion.h1>
              <motion.p
                className="mt-5 max-w-md text-base font-light leading-relaxed text-white/60"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.12 }}
              >
                {chain.seedPrompt} One Keeper at a time. Leave your mark, pass it on — or the line
                ends here.
              </motion.p>

              {cities.length > 0 && (
                <p className="mt-4 font-mono text-xs font-bold text-[#99ee2d]/80">
                  {cities.join(' → ')}
                </p>
              )}

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={primaryCta.disabled || !primaryCta.action}
                  onClick={() => primaryCta.action?.()}
                  className="arena-cta flex items-center gap-2 px-5 py-3.5 text-sm font-bold uppercase disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                  {primaryCta.label}
                </button>
                {canRescue && address && chain ? (
                  <button
                    type="button"
                    disabled={rescue.isPending}
                    onClick={() => rescue.mutate({ address, journeyId: chain.id })}
                    className="flex items-center gap-2 border border-[#a855f7] bg-[#a855f7]/20 px-4 py-3 text-xs font-bold uppercase text-white disabled:opacity-40"
                  >
                    {rescue.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LifeBuoy className="h-4 w-4" />
                    )}
                    Rescue · +{RESCUE_EXTEND_HOURS}h
                  </button>
                ) : null}
                {isHolder && hasContributedThisTurn && (
                  <button
                    type="button"
                    onClick={() => openHandoff(chain.creatorName)}
                    className="flex items-center gap-2 border border-white/30 px-4 py-3 text-xs font-bold uppercase text-white"
                  >
                    <Home className="h-4 w-4" />
                    Send home to {chain.creatorName}
                  </button>
                )}
              </div>
              {rescue.error ? (
                <p className="mt-3 text-xs font-bold text-[#99ee2d]">{rescue.error.message}</p>
              ) : null}
              {isCritical && !isHolder ? (
                <p className="mt-3 max-w-md border border-[#af2a3a]/50 bg-[#af2a3a]/20 px-3 py-2 text-xs text-white/90">
                  Under two hours left. Join the room to buy it more time — or ask to take it
                  yourself.
                </p>
              ) : null}

              <div className="mt-6 flex flex-wrap gap-2 font-mono text-[10px] font-bold uppercase tracking-wider">
                <span className="border border-white/20 px-2 py-1 text-white/75">
                  Held by {currentOwner?.name}
                  {currentOwner?.city ? ` · ${currentOwner.city}` : ''}
                </span>
                <span className="border border-white/20 px-2 py-1 text-white/75">
                  {chain.mode === 'return_home'
                    ? `Must return to ${chain.creatorName}`
                    : 'Travels freely'}
                </span>
                <span className="border border-[#99ee2d]/50 px-2 py-1 text-[#99ee2d]">
                  Pot · {chain.rewardPoolCkb} CKB
                </span>
                {chain.stakes ? (
                  <span className="border border-[#a855f7] bg-[#a855f7]/25 px-2 py-1 text-white">
                    Stakes · next {stakesEntryAtHop(chain.stakes, chain.owners.length)}
                  </span>
                ) : null}
                {chain.genesisTxHash ? (
                  <a
                    href={`https://pudge.explorer.nervos.org/transaction/${chain.lastTxHash ?? chain.genesisTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="border border-[#99ee2d]/40 px-2 py-1 text-[#99ee2d]"
                  >
                    On-chain Cell
                  </a>
                ) : null}
                {isHolder && (
                  <span className="bg-[#99ee2d] px-2 py-1 text-[#111]">You hold it</span>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                {room ? (
                  <Link
                    href={`/communities/${room.slug}`}
                    className="border border-[#99ee2d]/50 px-3 py-2 text-[10px] font-bold uppercase text-[#99ee2d]"
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
                  href="/events"
                  className="text-[10px] font-bold uppercase tracking-wider text-white/60 underline-offset-2 hover:text-[#99ee2d] hover:underline"
                >
                  Live events →
                </Link>
              </div>
            </div>

            {/* Center figure / orb */}
            <motion.div
              className="relative z-10 mx-auto flex flex-col items-center lg:px-6"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 120 }}
            >
              <div
                className="pointer-events-none absolute left-1/2 top-1/4 h-56 w-56 -translate-x-1/2 rounded-full bg-[#a855f7]/35 blur-[70px]"
                aria-hidden
              />
              <ChainOrb
                state={orbState}
                cellHash={currentOwner?.cellHash}
                coverImageUrl={chain.coverImageUrl}
                creatureName={chain.creatureName}
              />
            </motion.div>

            {/* Side rail: countdown + lineage teaser */}
            <aside className="relative z-10 border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <div
                className="pointer-events-none absolute left-0 top-10 hidden h-[70%] w-px bg-gradient-to-b from-[#99ee2d] via-[#a855f7] to-transparent lg:block"
                aria-hidden
              />
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#99ee2d]">
                {dead ? 'Locked' : returned ? 'Home' : 'The Cell lives'}
              </p>
              <p className="mt-1 text-xs text-white/45">Keeper window</p>
              <div className="mt-4 border border-white/10 bg-black/50 p-4 backdrop-blur-md">
                <Countdown countdown={countdown} dead={Boolean(dead) || Boolean(returned)} />
              </div>
              <p className="mt-4 font-mono text-[10px] font-bold uppercase text-white/40">
                Line · {holderNumber} keepers
                {ageLabel ? ` · ${ageLabel} old` : ''}
              </p>
              <button
                type="button"
                onClick={() =>
                  document.getElementById('journey-trail')?.scrollIntoView({ behavior: 'smooth' })
                }
                className="mt-3 w-full border border-white/15 bg-black/40 px-3 py-2.5 text-[10px] font-bold uppercase text-white/80 hover:border-[#99ee2d]/50"
              >
                See the full line →
              </button>
              <Link
                href="/streaks"
                className="mt-2 block text-center text-[10px] font-bold uppercase text-white/45 hover:text-[#99ee2d]"
              >
                All Chain Cells
              </Link>
            </aside>
          </div>
        </div>
      </section>

      {room && !room.isMember && !isHolder && (
        <section className="border-t border-white/10 bg-black/50 px-5 py-4 text-white sm:px-10">
          <p className="mx-auto max-w-[1440px] text-sm font-light text-white/70">
            You can watch from here. Join{' '}
            <Link href={`/communities/${room.slug}`} className="font-bold uppercase text-[#99ee2d] underline">
              {room.name}
            </Link>{' '}
            to take a turn with this Cell.
          </p>
        </section>
      )}

      {/* ——— Mark (holder / nominee) ——— */}
      {canDraft && (
        <section
          id="contribute-ritual"
          className="relative border-t border-white/10 px-5 py-14 text-white sm:px-10"
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 50% 40% at 80% 20%, rgba(168,85,247,0.18), transparent 55%)',
            }}
            aria-hidden
          />
          <div className="relative mx-auto grid max-w-[1440px] items-start gap-10 lg:grid-cols-[1fr_minmax(220px,280px)]">
            <div>
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#99ee2d]">
                Your turn
              </p>
              <h2 className="mt-2 font-poster text-3xl uppercase leading-none text-white sm:text-4xl">
                Leave a mark
              </h2>
              <p className="mt-3 max-w-lg text-sm font-light text-white/55">
                Seal something into the Cell before you pass. The line only grows if you add to it.
              </p>
              {isNominated && !isHolder ? (
                <p className="mt-4 border border-[#99ee2d]/40 bg-[#99ee2d]/10 px-3 py-2 text-sm text-white">
                  This Cell is heading to you. Draft now — seal once you hold it.
                </p>
              ) : null}
              <div className="mt-6 border border-white/10 bg-black/45 p-4 backdrop-blur-md sm:p-6">
                <ContributeRitual
                  seedPrompt={chain.seedPrompt}
                  alreadySealed={isHolder ? hasContributedThisTurn : false}
                  publishing={ecosystem.publish.isPending}
                  error={ecosystem.publish.error?.message ?? null}
                  artifactRoot={chain.artifactRoot}
                  artifactRootOnChain={chain.artifactRootOnChain}
                  draftInitial={draftQuery.data}
                  savingDraft={saveDraft.isPending}
                  allowSeal={isHolder}
                  onSaveDraft={
                    address && chain
                      ? (input) =>
                          saveDraft.mutate({
                            address,
                            journeyId: chain.id,
                            ...input,
                          })
                      : undefined
                  }
                  onPublish={(input) => {
                    if (!isHolder) return;
                    ecosystem.publish.mutate({
                      ...input,
                      address: address ?? undefined,
                      journeyId: chain.id,
                      chain,
                    });
                  }}
                />
                {isHolder && hasContributedThisTurn && (
                  <button
                    type="button"
                    onClick={() => openHandoff()}
                    className="arena-cta mt-4 flex w-full items-center justify-center gap-2 px-4 py-3.5 text-sm font-bold uppercase"
                  >
                    <Send className="h-4 w-4" />
                    Pass {chain.creatureName}
                  </button>
                )}
              </div>
            </div>
            <aside className="relative hidden border-l border-white/10 pl-6 lg:block">
              <div
                className="pointer-events-none absolute left-0 top-4 h-2/3 w-px bg-gradient-to-b from-[#99ee2d] to-transparent"
                aria-hidden
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/uismod/char-3.png"
                alt=""
                className="mx-auto max-h-[320px] w-auto object-contain drop-shadow-[0_0_28px_rgba(168,85,247,0.35)]"
              />
              <p className="mt-4 text-center font-mono text-[10px] font-bold uppercase text-white/40">
                Mark · then pass
              </p>
            </aside>
          </div>
        </section>
      )}

      {/* ——— The line (restructured) ——— */}
      <section
        id="journey-trail"
        className="relative border-t border-white/10 px-5 py-14 text-white sm:px-10"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 20% 0%, rgba(153,238,45,0.08), transparent 50%)',
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-[1440px] space-y-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#99ee2d]">
                The line
              </p>
              <h2 className="mt-2 font-poster text-3xl uppercase leading-none text-white sm:text-5xl">
                What {holderNumber} people made of it
              </h2>
              <p className="mt-3 max-w-xl text-sm font-light text-white/55">
                Every Keeper left something behind. The Cell is worth more now than when it left.
              </p>
            </div>
            <div className="w-full max-w-xs sm:w-auto">
              <JourneySwitcher activeId={chain.id} />
            </div>
          </div>

          {me?.onboarded && !dead && !returned ? (
            <div className="border border-white/10 bg-black/40 p-4 backdrop-blur-md sm:p-5">
              <p className="mb-3 font-mono text-[10px] font-bold uppercase text-[#99ee2d]">
                Handoff queue
              </p>
              <HandoffPanel
                journeyId={chain.id}
                isHolder={isHolder}
                canRequest={Boolean(
                  communities.data?.some(
                    (c) => c.id === chain.communityId && c.isMember,
                  ),
                )}
              />
            </div>
          ) : null}

          {chain.stakes ? (
            <div className="border border-white/10 bg-black/40 p-4 backdrop-blur-md sm:p-5">
              <p className="mb-3 font-mono text-[10px] font-bold uppercase text-[#99ee2d]">
                Stakes pot
              </p>
              <StakesPanel chain={chain} address={address} />
            </div>
          ) : null}

          <div>
            <p className="mb-4 font-mono text-[10px] font-bold uppercase tracking-wider text-white/45">
              Keepers on this Cell
            </p>
            <KeeperFigureCarousel owners={chain.owners} currentIsDead={Boolean(dead)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="border border-white/10 bg-black/40 p-4 backdrop-blur-md sm:p-5">
              <p className="mb-3 font-mono text-[10px] font-bold uppercase text-[#99ee2d]">
                Journey card
              </p>
              <JourneyCard chain={chain} artifact={ecosystem.artifact.data ?? null} />
            </div>
            <div className="border border-white/10 bg-black/50 p-5 backdrop-blur-md">
              <div className="flex items-baseline justify-between border-b border-white/10 pb-3">
                <h3 className="font-poster text-2xl uppercase leading-none text-white">Lineage</h3>
                <span className="font-mono text-[10px] font-bold text-white/40">Newest first</span>
              </div>
              <div className="mt-3 max-h-[420px] overflow-y-auto pr-1">
                <LineageList owners={chain.owners} dead={Boolean(dead)} />
              </div>
            </div>
          </div>
        </div>
      </section>

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
        members={passMembers}
        excludeAddress={address}
        onNeedMark={scrollToMark}
        onClose={() => {
          setDialogOpen(false);
          setNominatedRecipient('');
        }}
        onSubmit={handleSubmit}
      />

      {returned && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto max-w-lg px-4">
          <div className="border border-[#99ee2d]/40 bg-[#0c0c12]/95 p-4 text-center text-white shadow-2xl backdrop-blur-md">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#99ee2d]">
              It made it home
            </p>
            <p className="mt-1 font-poster text-2xl uppercase leading-none">
              {chain.creatureName} came home to {chain.creatorName}
            </p>
            <p className="mt-2 text-xs font-light text-white/65">
              {chain.owners.length} holders · sealed as a living artefact.
            </p>
          </div>
        </div>
      )}

      <DeadOverlay
        open={Boolean(dead)}
        ownerCount={chain.owners.length}
        lastOwner={currentOwner?.name ?? ''}
        creatureName={chain.creatureName}
        ageLabel={ageLabel}
        creatorName={chain.creatorName}
      />
    </div>
  );
}
