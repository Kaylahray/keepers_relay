'use client';

import { useMemo, useRef, useState, useEffect, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Coins,
  Flame,
  Home,
  Loader2,
  Rocket,
  Sparkles,
  Timer,
} from 'lucide-react';
import { useLaunchJourney } from '@/hooks/useChain';
import { useCommunitiesQuery } from '@/hooks/useCommunity';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';
import { CoverPicker } from '@/components/CoverPicker';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { arenaCoverForSeed, resolveCover } from '@/lib/poster';
import {
  STAKES_DEFAULTS,
  stakesEntryAtHop,
  stakesWindowHoursAtHop,
  type ChainMode,
} from '@/types/chain';

type KindId = 'blitz' | 'quest' | 'archive';

const KINDS: {
  id: KindId;
  label: string;
  tag: string;
  blurb: string;
  art: string;
  tint: string;
}[] = [
  {
    id: 'blitz',
    label: 'Blitz',
    tag: 'Sport',
    blurb: 'Stakes on. Pot grows. Clock shrinks. Pure pressure.',
    art: '/arena/kind-blitz.png',
    tint: '#af2a3a',
  },
  {
    id: 'quest',
    label: 'Quest',
    tag: 'Finish line',
    blurb: 'Return-home. New Keepers only, then back to you.',
    art: '/arena/kind-quest.png',
    tint: '#e1bf47',
  },
  {
    id: 'archive',
    label: 'Archive',
    tag: 'Long game',
    blurb: 'Open travel. Slow windows. Prestige over panic.',
    art: '/arena/kind-archive.png',
    tint: '#49b649',
  },
];

const WINDOWS: { hours: number; label: string; note: string }[] = [
  { hours: 12, label: '12 hours', note: 'Frantic. Room already awake.' },
  { hours: 24, label: '24 hours', note: 'A day each. Sleep on it.' },
  { hours: 72, label: '3 days', note: 'Relaxed marks.' },
  { hours: 168, label: '7 days', note: 'Weekly rhythm.' },
  { hours: 720, label: '30 days', note: 'Monthly. Slow burn.' },
];

const ARCHIVE_WINDOWS = WINDOWS.filter((w) => w.hours >= 168);
const BLITZ_WINDOWS = WINDOWS.filter((w) => w.hours <= 24);

const ARCHIVE_GOALS: { hops: number; label: string; note: string }[] = [
  { hops: 30, label: '30 passes', note: 'A season of marks.' },
  { hops: 100, label: '100 passes', note: 'Serious lineage.' },
  { hops: 300, label: '300 passes', note: 'The long archive — keep it moving for years of hops.' },
];

type PathStep = { id: string; label: string; hint: string };

function pathForKind(kind: KindId | null): PathStep[] {
  if (kind === 'archive') {
    return [
      { id: 'kind', label: 'Kind', hint: 'Long game' },
      { id: 'identity', label: 'Streak', hint: 'Name & cover' },
      { id: 'cadence', label: 'Cadence', hint: 'Pace & goal' },
      { id: 'send', label: 'Send', hint: 'Review & launch' },
    ];
  }
  if (kind === 'blitz') {
    return [
      { id: 'kind', label: 'Kind', hint: 'Sport' },
      { id: 'identity', label: 'Identity', hint: 'Name & room' },
      { id: 'pressure', label: 'Pressure', hint: 'Short clock' },
      { id: 'pot', label: 'Pot', hint: 'Stakes on' },
    ];
  }
  if (kind === 'quest') {
    return [
      { id: 'kind', label: 'Kind', hint: 'Finish line' },
      { id: 'identity', label: 'Identity', hint: 'Name & room' },
      { id: 'pressure', label: 'Pressure', hint: 'Home path' },
      { id: 'pot', label: 'Pot', hint: 'Optional seed' },
    ];
  }
  return [
    { id: 'kind', label: 'Kind', hint: 'How it plays' },
    { id: 'identity', label: 'Identity', hint: 'Name & room' },
    { id: 'pressure', label: 'Pressure', hint: 'Clock & path' },
    { id: 'pot', label: 'Pot', hint: 'Seed & stakes' },
  ];
}

function formatWindow(hours: number): string {
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

function applyKind(
  kind: KindId,
  setters: {
    setStakesOn: (v: boolean) => void;
    setMode: (v: ChainMode) => void;
    setWindowHours: (v: number) => void;
    setInitialCkb: (fn: (n: number) => number) => void;
    setCoverImageUrl: (v: string) => void;
    setCoverLocked: (v: boolean) => void;
  },
) {
  const art = KINDS.find((k) => k.id === kind)?.art ?? '/arena/kind-blitz.png';
  if (kind === 'blitz') {
    setters.setStakesOn(true);
    setters.setMode('open');
    setters.setWindowHours(12);
    setters.setInitialCkb((n) => Math.max(n, 5));
  } else if (kind === 'quest') {
    setters.setStakesOn(false);
    setters.setMode('return_home');
    setters.setWindowHours(72);
  } else {
    setters.setStakesOn(false);
    setters.setMode('open');
    setters.setWindowHours(168);
    setters.setInitialCkb(() => 0);
  }
  setters.setCoverImageUrl(art);
  setters.setCoverLocked(true);
}

export function LaunchJourneyView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address, isConnected, connect } = useWallet();
  const myBuilder = useMyBuilder();
  const { username: onChainUsername } = useUsername();
  const launch = useLaunchJourney();
  const communities = useCommunitiesQuery();
  const me = myBuilder.data?.builder;

  const memberCommunities = useMemo(
    () => (communities.data ?? []).filter((c) => c.isMember),
    [communities.data],
  );

  const presetCommunityId = searchParams.get('community') ?? '';
  const kindPreset = searchParams.get('kind') as KindId | null;
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<KindId | null>(
    kindPreset === 'blitz' || kindPreset === 'quest' || kindPreset === 'archive'
      ? kindPreset
      : null,
  );
  const [communityId, setCommunityId] = useState(presetCommunityId);
  const [creatureName, setCreatureName] = useState('');
  const [seedPrompt, setSeedPrompt] = useState('');
  const [mode, setMode] = useState<ChainMode>('return_home');
  const [trophyGoal, setTrophyGoal] = useState(50);
  const [windowHours, setWindowHours] = useState(24);
  const [initialCkb, setInitialCkb] = useState(0);
  const [rewardPoolNote, setRewardPoolNote] = useState('');
  const [stakesOn, setStakesOn] = useState(false);
  const [entryCkb, setEntryCkb] = useState(STAKES_DEFAULTS.entryCkb);
  const [escalationPct, setEscalationPct] = useState(STAKES_DEFAULTS.escalationPct);
  const [decayPct, setDecayPct] = useState(STAKES_DEFAULTS.decayPct);
  const [coverImageUrl, setCoverImageUrl] = useState('/arena/kind-quest.png');
  const [coverLocked, setCoverLocked] = useState(false);
  const launchGuardRef = useRef(false);

  useEffect(() => {
    if (kindPreset === 'blitz' || kindPreset === 'quest' || kindPreset === 'archive') {
      setKind(kindPreset);
      applyKind(kindPreset, {
        setStakesOn,
        setMode,
        setWindowHours,
        setInitialCkb,
        setCoverImageUrl,
        setCoverLocked,
      });
      if (kindPreset === 'archive') setTrophyGoal(100);
      if (kindPreset === 'blitz') setTrophyGoal(50);
      if (kindPreset === 'quest') setTrophyGoal(12);
      setStep(0);
    }
  }, [kindPreset]);

  const selectedCommunityId =
    communityId ||
    (memberCommunities.some((c) => c.id === presetCommunityId)
      ? presetCommunityId
      : memberCommunities[0]?.id ?? '');
  const selectedRoom = memberCommunities.find((c) => c.id === selectedCommunityId);
  const balance = me?.pointsBalance ?? 0;
  const activeKind = KINDS.find((k) => k.id === kind) ?? null;

  const stakesPreview = useMemo(() => {
    const config = { ...STAKES_DEFAULTS, entryCkb, escalationPct, decayPct };
    let pot = initialCkb;
    return [1, 2, 3, 4, 5].map((hop) => {
      const cost = stakesEntryAtHop(config, hop);
      pot += cost;
      return {
        hop,
        cost,
        pot,
        window: stakesWindowHoursAtHop(config, windowHours, hop),
      };
    });
  }, [entryCkb, escalationPct, decayPct, initialCkb, windowHours]);

  const pathSteps = pathForKind(kind);
  const currentStep = pathSteps[step] ?? pathSteps[0]!;
  /** Kind only until they leave step 0 — then the path for that kind appears. */
  const railSteps = step === 0 ? pathSteps.slice(0, 1) : pathSteps;
  const fromParam = searchParams.get('from');
  const shellBack =
    fromParam === 'events'
      ? { href: '/events/new', label: 'Host' }
      : fromParam === 'rooms'
        ? { href: '/communities', label: 'Rooms' }
        : { href: '/', label: 'Arena' };
  const identityReady = Boolean(
    kind && selectedCommunityId && creatureName.trim() && seedPrompt.trim(),
  );
  const potOverBalance = initialCkb > balance;
  const canLaunch = identityReady && !potOverBalance && !launch.isPending;

  const stepSummaries = pathSteps.map((item) => {
    if (item.id === 'kind') return kind ? KINDS.find((k) => k.id === kind)?.label ?? '—' : 'Pick a pitch';
    if (item.id === 'identity') {
      return creatureName.trim() || (kind === 'archive' ? 'Name the streak' : 'Name the Cell');
    }
    if (item.id === 'cadence') {
      return `${formatWindow(windowHours)} · goal ${trophyGoal}`;
    }
    if (item.id === 'pressure') {
      return `${formatWindow(windowHours)} · ${mode === 'return_home' ? 'Home' : 'Open'}`;
    }
    if (item.id === 'send') return 'Ready to launch';
    if (item.id === 'pot') {
      return stakesOn ? `Stakes · pot ${initialCkb}` : `Pot ${initialCkb}`;
    }
    return item.hint;
  });

  function pickKind(next: KindId) {
    setKind(next);
    applyKind(next, {
      setStakesOn,
      setMode,
      setWindowHours,
      setInitialCkb,
      setCoverImageUrl,
      setCoverLocked,
    });
    if (next === 'archive') setTrophyGoal(100);
    if (next === 'blitz') setTrophyGoal(50);
    if (next === 'quest') setTrophyGoal(12);
    setStep(0);
  }

  function canJumpTo(index: number) {
    if (index === 0) return true;
    if (index === 1) return Boolean(kind);
    if (index >= 2) return identityReady;
    return false;
  }

  function goNext() {
    if (step === 0 && !kind) return;
    if (step === 1 && !identityReady) return;
    setStep((s) => Math.min(pathSteps.length - 1, s + 1));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (step < pathSteps.length - 1) {
      goNext();
      return;
    }
    if (launchGuardRef.current) return;
    if (!address || !me?.onboarded || !canLaunch) return;
    launchGuardRef.current = true;
    launch.mutate(
      {
        address,
        communityId: selectedCommunityId,
        creatureName,
        seedPrompt,
        mode,
        trophyGoal,
        windowHours,
        initialCkb: kind === 'archive' ? 0 : initialCkb,
        rewardPoolNote: rewardPoolNote.trim() || undefined,
        coverImageUrl,
        stakes:
          kind === 'blitz' || stakesOn
            ? { ...STAKES_DEFAULTS, entryCkb, escalationPct, decayPct }
            : null,
      },
      {
        onSuccess: (chain) => router.push(`/streaks/${chain.id}`),
        onSettled: () => {
          launchGuardRef.current = false;
        },
      },
    );
  }

  const gateKind =
    kind ??
    (kindPreset === 'blitz' || kindPreset === 'quest' || kindPreset === 'archive'
      ? kindPreset
      : null);
  const gateKindMeta = gateKind ? KINDS.find((k) => k.id === gateKind) : null;
  const joinNext = gateKind
    ? `/join?next=${encodeURIComponent(`/launch?kind=${gateKind}`)}`
    : `/join?next=${encodeURIComponent('/launch')}`;

  if (!isConnected) {
    return (
      <LaunchShell focusKind={gateKind} back={shellBack}>
        <LaunchGate
          focusKind={gateKind}
          title="Connect to send one out"
          action={<ArenaCta onClick={() => connect()}>Connect wallet</ArenaCta>}
        />
      </LaunchShell>
    );
  }

  if (!me?.onboarded) {
    return (
      <LaunchShell focusKind={gateKind} back={shellBack}>
        <LaunchGate
          focusKind={gateKind}
          title="Claim a handle first"
          body={
            onChainUsername?.username ? (
              `Welcome back, @${onChainUsername.username}. Finish joining so your Cell has a name on it.`
            ) : (
              'A Cell needs an @handle before it can leave your wallet.'
            )
          }
          action={<ArenaCta href={joinNext}>Claim a handle</ArenaCta>}
        />
      </LaunchShell>
    );
  }

  if (memberCommunities.length === 0) {
    return (
      <LaunchShell focusKind={gateKind} back={shellBack}>
        <LaunchGate
          focusKind={gateKind}
          title="Join a room first"
          body={
            gateKindMeta
              ? `You’re launching ${gateKindMeta.label}. Every Cell needs a room — join one, then the path continues with Identity → Pressure → Pot.`
              : 'Every Cell launches into a room. Join one, then pick Blitz, Quest, or Archive on the path.'
          }
          action={
            <ArenaCta
              href={
                gateKind
                  ? `/communities?next=${encodeURIComponent(`/launch?kind=${gateKind}${fromParam ? `&from=${fromParam}` : ''}`)}`
                  : '/communities'
              }
            >
              Find a room
            </ArenaCta>
          }
          secondary={
            <Link
              href="/streaks"
              className="text-sm text-white/55 underline decoration-white/25 underline-offset-4 hover:text-[#99ee2d]"
            >
              Or browse living Cells →
            </Link>
          }
        />
      </LaunchShell>
    );
  }

  return (
    <LaunchShell focusKind={step > 0 ? gateKind : null} back={shellBack}>
      <form
        onSubmit={submit}
        className="grid gap-0 lg:grid-cols-[minmax(220px,280px)_1fr] lg:gap-0"
      >
        {/* ——— Progressive left path ——— */}
        <aside className="relative border-b border-white/10 pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8">
          <div
            className="pointer-events-none absolute right-0 top-4 hidden h-[80%] w-px bg-gradient-to-b from-[#99ee2d] via-[#a855f7] to-transparent lg:block"
            aria-hidden
          />
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
            Launch path
          </p>
          <p className="mt-1 text-xs text-white/45">
            {step === 0
              ? 'Start with a kind'
              : `Step ${step + 1} of ${pathSteps.length}`}
          </p>

          <ol className="mt-6 space-y-0">
            {railSteps.map((item, index) => {
              const done = index < step;
              const active = index === step;
              const jumpable = canJumpTo(index);
              return (
                <li key={item.id} className="relative flex gap-3 pb-6 last:pb-0">
                  {index < railSteps.length - 1 ? (
                    <span
                      className={`absolute left-[15px] top-8 h-[calc(100%-1.25rem)] w-px ${
                        done ? 'bg-[#99ee2d]/60' : 'bg-white/10'
                      }`}
                      aria-hidden
                    />
                  ) : null}
                  <button
                    type="button"
                    disabled={!jumpable}
                    onClick={() => jumpable && setStep(index)}
                    className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center border text-[11px] font-bold transition ${
                      active
                        ? 'border-[#99ee2d] bg-[#99ee2d] text-[#111]'
                        : done
                          ? 'border-[#99ee2d]/50 bg-[#99ee2d]/15 text-[#99ee2d]'
                          : 'border-white/20 bg-black/40 text-white/40'
                    } ${jumpable ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </button>
                  <button
                    type="button"
                    disabled={!jumpable}
                    onClick={() => jumpable && setStep(index)}
                    className={`min-w-0 flex-1 pt-0.5 text-left ${jumpable ? '' : 'opacity-50'}`}
                  >
                    <span
                      className={`block font-poster text-lg uppercase leading-none ${
                        active ? 'text-white' : done ? 'text-white/80' : 'text-white/40'
                      }`}
                    >
                      {item.label}
                    </span>
                    <span className="mt-1 block text-[11px] text-white/45">
                      {active ? item.hint : stepSummaries[index]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* Sticky preview under the path on desktop */}
          <div className="mt-8 hidden border border-white/10 bg-black/45 backdrop-blur-md lg:block">
            <div className="relative h-36 bg-black/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveCover(coverImageUrl, creatureName || kind || 'keepers')}
                alt=""
                className="h-full w-full object-contain object-bottom"
              />
              {activeKind ? (
                <span
                  className="absolute left-2 top-2 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-white"
                  style={{ background: activeKind.tint }}
                >
                  {activeKind.label}
                </span>
              ) : null}
            </div>
            <div className="p-3">
              <p className="font-mono text-[9px] font-bold uppercase text-white/40">
                {selectedRoom?.name ?? 'Room'}
              </p>
              <p className="mt-0.5 font-poster text-xl uppercase leading-none text-white">
                {creatureName.trim() || 'Unnamed Cell'}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[9px] font-bold text-white/60">
                <span className="border border-white/15 px-1.5 py-0.5">
                  {formatWindow(windowHours)}
                </span>
                <span className="border border-white/15 px-1.5 py-0.5">
                  Pot {initialCkb}
                </span>
                {stakesOn ? (
                  <span className="border border-[#a855f7]/50 px-1.5 py-0.5 text-[#c4b5fd]">
                    Stakes
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </aside>

        {/* ——— Dynamic right panel ——— */}
        <div className="min-w-0 lg:pl-10">
          <AnimatePresence mode="wait">
            {currentStep.id === 'kind' && (
              <StepPanel
                key="kind"
                title="How does it play?"
                intro="Each kind unlocks its own path — fields change after you pick."
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  {KINDS.map((card) => {
                    const selected = kind === card.id;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => pickKind(card.id)}
                        className={`group relative flex h-[260px] flex-col overflow-hidden border-2 text-left transition sm:h-[280px] ${
                          selected
                            ? 'border-[#99ee2d] ring-2 ring-[#99ee2d]/25'
                            : 'border-white/10 hover:border-white/25'
                        }`}
                        style={{ background: card.tint }}
                      >
                        <span className="relative z-10 p-3">
                          <span className="font-mono text-[9px] font-bold uppercase text-white/70">
                            {card.tag}
                          </span>
                          <span className="mt-1 block font-poster text-2xl uppercase leading-none text-white">
                            {card.label}
                          </span>
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={card.art}
                          alt=""
                          className="absolute inset-x-0 bottom-0 top-14 mx-auto h-[calc(100%-3.5rem)] w-auto max-w-[92%] object-contain object-bottom transition group-hover:scale-[1.03]"
                        />
                        <span className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 to-transparent p-3 pt-10">
                          <span className="block text-[11px] font-light leading-snug text-white/90">
                            {card.blurb}
                          </span>
                        </span>
                        {selected ? (
                          <span className="absolute right-2 top-2 z-20 bg-[#99ee2d] px-2 py-0.5 text-[9px] font-bold uppercase text-[#111]">
                            Selected
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </StepPanel>
            )}

            {currentStep.id === 'identity' && (
              <StepPanel
                key="identity"
                title={kind === 'archive' ? 'Name your streak' : 'Name the Cell'}
                intro={
                  kind === 'archive'
                    ? 'This is your long game. Name it, pick a cover, and write the mark every Keeper leaves — no pot, no player count.'
                    : 'One question every Keeper answers before they can pass.'
                }
              >
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                    Which room
                  </span>
                  <select
                    value={selectedCommunityId}
                    onChange={(e) => setCommunityId(e.target.value)}
                    className="mt-2 w-full border border-white/15 bg-black/40 px-3 py-2.5 text-sm font-medium text-white outline-none focus:border-[#99ee2d]"
                  >
                    {memberCommunities.map((c) => (
                      <option key={c.id} value={c.id} className="bg-[#111]">
                        {c.name}
                        {c.featured ? ' · featured' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mt-4 block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                    {kind === 'archive' ? 'Streak name' : 'Name the Cell'}
                  </span>
                  <input
                    value={creatureName}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCreatureName(next);
                      if (!coverLocked) {
                        setCoverImageUrl(
                          activeKind?.art ?? arenaCoverForSeed(next || 'keepers'),
                        );
                      }
                    }}
                    maxLength={40}
                    required
                    placeholder={
                      kind === 'archive' ? 'e.g. 300 Days of Marks' : 'e.g. Window Relay'
                    }
                    className="mt-2 w-full border border-white/15 bg-black/40 px-3 py-2.5 text-sm font-medium text-white outline-none placeholder:text-white/35 focus:border-[#99ee2d]"
                  />
                </label>

                <label className="mt-4 block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                    {kind === 'archive'
                      ? 'The mark every Keeper leaves'
                      : 'The prompt every Keeper answers'}
                  </span>
                  <textarea
                    value={seedPrompt}
                    onChange={(e) => setSeedPrompt(e.target.value)}
                    maxLength={160}
                    required
                    rows={3}
                    placeholder={
                      kind === 'archive'
                        ? 'e.g. One line about what you built or learned this week.'
                        : 'e.g. Show me the view outside your window — one line, one place.'
                    }
                    className="mt-2 w-full resize-none border border-white/15 bg-black/40 px-3 py-2.5 text-sm font-medium text-white outline-none placeholder:text-white/35 focus:border-[#99ee2d]"
                  />
                  <span className="mt-1.5 block text-[11px] text-white/45">
                    Small and specific. {160 - seedPrompt.length} left.
                  </span>
                </label>

                <CoverPicker
                  value={coverImageUrl}
                  seed={creatureName || kind || 'keepers'}
                  onChange={(url) => {
                    setCoverImageUrl(url);
                    setCoverLocked(true);
                  }}
                  label={kind === 'archive' ? 'Cover' : undefined}
                />
              </StepPanel>
            )}

            {currentStep.id === 'cadence' && (
              <StepPanel
                key="cadence"
                title="How long is each hold?"
                intro="Archive is weekly / monthly energy — pick a pass window and a lineage goal (e.g. 300 passes). No seed pot here."
              >
                <fieldset>
                  <legend className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                    Each Keeper gets
                  </legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {ARCHIVE_WINDOWS.map((option) => (
                      <button
                        key={option.hours}
                        type="button"
                        onClick={() => setWindowHours(option.hours)}
                        className={`border p-3 text-left transition ${
                          windowHours === option.hours
                            ? 'border-[#99ee2d] bg-[#99ee2d]/15 text-white'
                            : 'border-white/10 bg-black/30 text-white/80 hover:border-white/25'
                        }`}
                      >
                        <span className="block text-sm font-bold uppercase">{option.label}</span>
                        <span className="mt-1 block text-[11px] text-white/50">{option.note}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="mt-5">
                  <legend className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                    Lineage goal
                  </legend>
                  <div className="mt-2 grid gap-2">
                    {ARCHIVE_GOALS.map((goal) => (
                      <button
                        key={goal.hops}
                        type="button"
                        onClick={() => setTrophyGoal(goal.hops)}
                        className={`border p-3 text-left transition ${
                          trophyGoal === goal.hops
                            ? 'border-[#49b649] bg-[#49b649]/20 text-white'
                            : 'border-white/10 bg-black/30 text-white/80 hover:border-white/25'
                        }`}
                      >
                        <span className="block text-sm font-bold uppercase">{goal.label}</span>
                        <span className="mt-1 block text-[11px] text-white/50">{goal.note}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <p className="mt-4 text-xs text-white/45">
                  Travels freely (open). If someone misses the window, the Cell dies — but the
                  lineage stays as a memorial you can still open.
                </p>
              </StepPanel>
            )}

            {currentStep.id === 'pressure' && (
              <StepPanel
                key="pressure"
                title={kind === 'blitz' ? 'How frantic?' : 'How much pressure?'}
                intro={
                  kind === 'blitz'
                    ? 'Short clocks only. Stakes land on the next step.'
                    : kind === 'quest'
                      ? 'Quest comes home — new Keepers only, then back to you.'
                      : 'Same window for every Keeper.'
                }
              >
                <fieldset>
                  <legend className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                    Each Keeper gets
                  </legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {(kind === 'blitz' ? BLITZ_WINDOWS : WINDOWS).map((option) => (
                      <button
                        key={option.hours}
                        type="button"
                        onClick={() => setWindowHours(option.hours)}
                        className={`border p-3 text-left transition ${
                          windowHours === option.hours
                            ? 'border-[#99ee2d] bg-[#99ee2d]/15 text-white'
                            : 'border-white/10 bg-black/30 text-white/80 hover:border-white/25'
                        }`}
                      >
                        <span className="block text-sm font-bold uppercase">{option.label}</span>
                        <span className="mt-1 block text-[11px] text-white/50">{option.note}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                {kind === 'quest' ? (
                  <p className="mt-4 border border-[#e1bf47]/30 bg-[#e1bf47]/10 px-3 py-2 text-xs text-white/80">
                    Path locked: comes home after new Keepers. Trophy around {trophyGoal} holders.
                  </p>
                ) : null}
              </StepPanel>
            )}

            {currentStep.id === 'send' && (
              <StepPanel
                key="send"
                title="Send it out"
                intro="Archive launches with no pot and no stakes — just the streak, the cover, and the cadence."
              >
                <ul className="space-y-2 border border-white/10 bg-black/40 p-4 font-mono text-[11px] text-white/75">
                  <li>Streak · {creatureName.trim() || '—'}</li>
                  <li>Room · {selectedRoom?.name ?? '—'}</li>
                  <li>Hold · {formatWindow(windowHours)} each</li>
                  <li>Goal · {trophyGoal} passes</li>
                  <li>Mode · open travel</li>
                </ul>
                <p className="mt-4 text-sm font-light text-white/55">
                  When it dies, it stays on the board as a memorial — lineage and marks stay readable.
                </p>
                <div className="mt-6 border border-[#99ee2d]/30 bg-[#99ee2d]/10 p-4">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#99ee2d]">
                    <Timer className="h-3.5 w-3.5" />
                    You hold it first
                  </p>
                  <p className="mt-1.5 text-xs font-light leading-relaxed text-white/70">
                    The clock starts on you. Leave your mark and pass within {formatWindow(windowHours)}{' '}
                    or it dies at Keeper #1 — still kept as history.
                  </p>
                </div>
              </StepPanel>
            )}

            {currentStep.id === 'pot' && (
              <StepPanel
                key="pot"
                title={kind === 'blitz' ? 'Stakes on' : 'Is anything on it?'}
                intro={
                  kind === 'blitz'
                    ? 'Blitz runs with escalating entry and a shrinking clock. Seed the pot.'
                    : 'Works with nothing at stake. Put CKB on it and people play harder.'
                }
              >
                <div className="border border-white/10 bg-black/40 p-4">
                  <p className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-white/45">
                    <span className="flex items-center gap-1.5">
                      <Coins className="h-3.5 w-3.5" />
                      Seed the pot
                    </span>
                    <span className="font-mono text-[11px] text-[#e1bf47]">
                      You have {balance} CKB
                    </span>
                  </p>
                  <input
                    type="number"
                    min={0}
                    max={balance}
                    value={initialCkb}
                    onChange={(e) => setInitialCkb(Number(e.target.value))}
                    className="mt-2 w-full border border-white/15 bg-black/40 px-3 py-2.5 text-sm font-medium text-white outline-none focus:border-[#99ee2d]"
                  />
                  {potOverBalance ? (
                    <p className="mt-2 text-[11px] font-bold uppercase text-[#99ee2d]">
                      That is more than you have.
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] text-white/45">
                      {kind === 'blitz'
                        ? 'Grows as Keepers pay to receive. Survivors who passed share it.'
                        : 'Split between Keepers who kept it alive when it comes home.'}
                    </p>
                  )}
                </div>
                {kind === 'blitz' ? (
                  <div className="mt-4 border border-[#a855f7]/40 bg-[#a855f7]/10 p-3 text-xs text-white/80">
                    <p className="flex items-center gap-2 font-bold uppercase">
                      <Flame className="h-4 w-4" />
                      Stakes mode on
                    </p>
                    <p className="mt-2 text-white/55">
                      Entry escalates, window shrinks. Passers share; holder at death forfeits.
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const next = !stakesOn;
                      setStakesOn(next);
                      if (next && initialCkb < 1) {
                        setInitialCkb(Math.min(entryCkb, balance));
                      }
                    }}
                    className={`mt-4 flex w-full items-center gap-2 border px-3 py-3 text-xs font-bold uppercase ${
                      stakesOn
                        ? 'border-[#a855f7] bg-[#a855f7]/20 text-white'
                        : 'border-white/15 bg-black/30 text-white/70'
                    }`}
                  >
                    <Flame className="h-4 w-4" />
                    Stakes mode {stakesOn ? '· on' : '· off'}
                  </button>
                )}
                <div className="mt-6 border border-[#99ee2d]/30 bg-[#99ee2d]/10 p-4">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#99ee2d]">
                    <Timer className="h-3.5 w-3.5" />
                    You hold it first
                  </p>
                  <p className="mt-1.5 text-xs font-light leading-relaxed text-white/70">
                    The moment you send it out, the clock starts on you. Leave your mark and pass
                    within {formatWindow(windowHours)} or it dies at Keeper #1.
                  </p>
                </div>
              </StepPanel>
            )}
          </AnimatePresence>


          {launch.error ? (
            <p role="alert" className="mt-4 text-sm font-bold text-[#99ee2d]">
              {launch.error.message}
            </p>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="inline-flex items-center gap-1.5 border border-white/20 px-3 py-3 text-xs font-bold uppercase text-white/80 hover:bg-white/5"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            ) : null}

            {step < pathSteps.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={step === 0 ? !kind : step === 1 ? !identityReady : false}
                className="arena-cta ml-auto inline-flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase disabled:opacity-40"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canLaunch}
                className="arena-cta ml-auto flex flex-1 items-center justify-center gap-2 px-4 py-3.5 text-sm font-bold uppercase disabled:opacity-40 sm:flex-none"
              >
                {launch.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4" />
                )}
                {launch.isPending ? 'Sign in wallet…' : 'Send it out'}
              </button>
            )}
          </div>

          {/* Mobile preview */}
          <div className="mt-8 border border-white/10 bg-black/45 lg:hidden">
            <div className="relative h-40 bg-black/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveCover(coverImageUrl, creatureName || kind || 'keepers')}
                alt=""
                className="h-full w-full object-contain object-bottom"
              />
            </div>
            <div className="p-3">
              <p className="font-poster text-xl uppercase text-white">
                {creatureName.trim() || 'Unnamed Cell'}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-white/55">
                {seedPrompt.trim() || 'Your prompt shows up here.'}
              </p>
            </div>
          </div>
        </div>
      </form>
    </LaunchShell>
  );
}

function StepPanel({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.22 }}
      className="border border-white/10 bg-black/40 p-5 backdrop-blur-md sm:p-6"
    >
      <h2 className="font-poster text-3xl uppercase leading-none text-white sm:text-4xl">
        {title}
      </h2>
      <p className="mt-2 max-w-lg text-sm font-light text-white/55">{intro}</p>
      <div className="mt-6">{children}</div>
    </motion.div>
  );
}

function LaunchGate({
  title,
  body,
  action,
  secondary,
  focusKind,
}: {
  title: string;
  body?: ReactNode;
  action: ReactNode;
  secondary?: ReactNode;
  /** When set (e.g. ?kind=archive), only show that kind — not Blitz/Quest/Archive all at once. */
  focusKind?: KindId | null;
}) {
  const cards = focusKind ? KINDS.filter((k) => k.id === focusKind) : KINDS;
  const focused = focusKind ? KINDS.find((k) => k.id === focusKind) : null;

  return (
    <div className="grid min-h-[52vh] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start">
      <div className="border border-white/10 bg-black/45 p-6 backdrop-blur-md sm:p-8">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#99ee2d]">
          Before the path
        </p>
        <h2 className="mt-2 font-poster text-3xl uppercase leading-none text-white sm:text-4xl">
          {title}
        </h2>
        {body ? (
          <p className="mt-3 max-w-md text-sm font-light leading-relaxed text-white/65">{body}</p>
        ) : null}
        <div className="mt-6 flex flex-col items-start gap-3">
          {action}
          {secondary}
        </div>
      </div>
      <div className={`grid gap-2 ${focused ? '' : 'sm:grid-cols-3 lg:grid-cols-1'}`}>
        {cards.map((card) => (
          <div
            key={card.id}
            className={`relative overflow-hidden border-2 border-[#99ee2d]/40 ${
              focused ? 'h-56 sm:h-64' : 'h-28 sm:h-32 lg:h-28'
            }`}
            style={{ background: card.tint }}
          >
            <div className="relative z-10 flex h-full flex-col justify-between p-4">
              <div>
                <span className="font-mono text-[9px] font-bold uppercase text-white/70">
                  {card.tag}
                </span>
                {focused ? (
                  <span className="mt-1 block font-mono text-[9px] font-bold uppercase text-[#99ee2d]">
                    Selected
                  </span>
                ) : null}
              </div>
              <span
                className={`font-poster uppercase leading-none text-white ${
                  focused ? 'text-4xl' : 'text-xl'
                }`}
              >
                {card.label}
              </span>
              {focused ? (
                <span className="max-w-[55%] text-[11px] font-light text-white/85">{card.blurb}</span>
              ) : null}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.art}
              alt=""
              className={`absolute bottom-0 right-0 object-contain object-bottom opacity-90 ${
                focused ? 'h-[95%] max-w-[50%]' : 'h-[90%] max-w-[45%]'
              }`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function LaunchShell({
  children,
  focusKind,
  back = { href: '/', label: 'Arena' },
}: {
  children: ReactNode;
  focusKind?: KindId | null;
  back?: { href: string; label: string };
}) {
  const focused = focusKind ? KINDS.find((k) => k.id === focusKind) : null;
  return (
    <ArenaStage backHref={back.href} backLabel={back.label} className="min-h-[calc(100vh-4rem)]">
      <div className="mb-8 max-w-xl">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
          Send one out
          {focused ? ` · ${focused.label}` : ''}
        </p>
        <h1 className="mt-3 font-poster text-[clamp(2.4rem,5vw,3.75rem)] uppercase leading-[0.92] text-white">
          Launch a Cell
        </h1>
        <p className="mt-3 text-sm font-light leading-relaxed text-white/55">
          {focused
            ? `${focused.label} is locked in. Finish the steps below, then send it into a room.`
            : 'Pick a kind, then Next — the rest of the path appears for that kind.'}
        </p>
      </div>
      {children}
    </ArenaStage>
  );
}
