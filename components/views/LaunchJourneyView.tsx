'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Coins, Home, Loader2, Rocket, Sparkles } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { useLaunchJourney } from '@/hooks/useChain';
import { useCommunitiesQuery } from '@/hooks/useCommunity';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';
import { CoverPicker } from '@/components/CoverPicker';
import { posterDataUri } from '@/lib/poster';
import { LAUNCH_PRESETS, type ChainMode } from '@/types/chain';

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
  const [communityId, setCommunityId] = useState(presetCommunityId);
  const [creatureName, setCreatureName] = useState('');
  const [seedPrompt, setSeedPrompt] = useState('');
  const [mode, setMode] = useState<ChainMode>('return_home');
  const [trophyGoal, setTrophyGoal] = useState(50);
  const [windowHours, setWindowHours] = useState(24);
  const [initialProof, setInitialProof] = useState(0);
  const [rewardPoolNote, setRewardPoolNote] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState(posterDataUri('Cell Scout'));
  const [coverLocked, setCoverLocked] = useState(false);

  const selectedCommunityId =
    communityId ||
    (memberCommunities.some((c) => c.id === presetCommunityId)
      ? presetCommunityId
      : memberCommunities[0]?.id ?? '');

  function applyPreset(index: number) {
    const preset = LAUNCH_PRESETS[index];
    if (!preset) return;
    setCreatureName(preset.creatureName);
    setSeedPrompt(preset.seedPrompt);
    setMode(preset.mode);
    setTrophyGoal(preset.trophyGoal);
    setCoverImageUrl(posterDataUri(preset.creatureName));
    setCoverLocked(false);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!address || !me?.onboarded || !selectedCommunityId || launch.isPending) return;
    launch.mutate(
      {
        address,
        communityId: selectedCommunityId,
        creatureName,
        seedPrompt,
        mode,
        trophyGoal,
        windowHours,
        initialProof,
        rewardPoolNote: rewardPoolNote.trim() || undefined,
        coverImageUrl,
      },
      {
        onSuccess: (chain) => router.push(`/streaks/${chain.id}`),
      },
    );
  }

  return (
    <PageShell
      eyebrow="Launch inside a community"
      title="Start a streak"
      intro="Name the Cell, pick a cover, and mint it into a room you belong to."
      backHref="/communities"
      backLabel="Communities"
    >
      {!isConnected ? (
        <button
          type="button"
          onClick={() => connect()}
          className="neo-button bg-[#224cff] px-5 py-3 text-sm font-black uppercase text-[#fff8e7]"
        >
          Connect wallet to launch
        </button>
      ) : !me?.onboarded ? (
        <p className="border-[3px] border-black bg-[#ffe454] p-4 text-sm font-semibold">
          {onChainUsername?.username ? (
            `Welcome back, @${onChainUsername.username}.`
          ) : (
            <>
              Connect and claim an @handle to launch.
              <Link href="/studio" className="ml-2 underline">
                Studio
              </Link>
            </>
          )}
        </p>
      ) : memberCommunities.length === 0 ? (
        <p className="border-[3px] border-black bg-[#ffe454] p-4 text-sm font-semibold">
          Join a community, then launch from there.
          <Link href="/communities" className="ml-2 underline">
            Communities
          </Link>
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="neo-card overflow-hidden bg-[#fff8e7] p-0">
            <p className="border-b-[3px] border-black px-5 pt-5 text-[10px] font-black uppercase tracking-[0.16em]">
              Kickstart ideas
            </p>
            <h2 className="px-5 pt-2 font-poster text-2xl uppercase leading-none">CKB presets</h2>
            <ul className="mt-4 space-y-0">
              {LAUNCH_PRESETS.map((preset, index) => (
                <li key={preset.creatureName} className="border-t-[3px] border-black">
                  <button
                    type="button"
                    onClick={() => applyPreset(index)}
                    className="grid w-full grid-cols-[7rem_1fr] text-left hover:bg-[#d6ff00] sm:grid-cols-[9rem_1fr]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={posterDataUri(preset.creatureName)}
                      alt=""
                      className="h-full min-h-[7rem] w-full object-cover"
                    />
                    <span className="p-3">
                      <span className="block font-black uppercase">{preset.creatureName}</span>
                      <span className="mt-1 block text-xs font-semibold leading-relaxed">
                        {preset.blurb}
                      </span>
                      <span className="mt-2 block font-mono text-[9px] font-bold text-black/55">
                        {preset.mode === 'return_home' ? 'RETURN HOME' : 'OPEN'} · trophy{' '}
                        {preset.trophyGoal}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="border-t-[3px] border-black p-4 text-xs font-semibold text-black/70">
              Your balance: <strong>{me.proofBalance} PROOF</strong>
            </p>
          </section>

          <form onSubmit={submit} className="neo-card bg-[#ffe454] p-5">
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 stroke-[3]" />
              <h2 className="font-poster text-2xl uppercase leading-none">Launch form</h2>
            </div>

            <label className="mt-5 block">
              <span className="text-[10px] font-black uppercase tracking-wider">Community</span>
              <select
                value={selectedCommunityId}
                onChange={(e) => setCommunityId(e.target.value)}
                className="mt-2 w-full border-[3px] border-black bg-[#fff8e7] px-3 py-2.5 text-sm font-semibold outline-none"
              >
                {memberCommunities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.featured ? ' · featured' : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 block">
              <span className="text-[10px] font-black uppercase tracking-wider">Journey name</span>
              <input
                value={creatureName}
                onChange={(e) => {
                  const next = e.target.value;
                  setCreatureName(next);
                  if (!coverLocked) setCoverImageUrl(posterDataUri(next || 'keepers'));
                }}
                maxLength={40}
                required
                placeholder="e.g. Cell Scout"
                className="mt-2 w-full border-[3px] border-black bg-[#fff8e7] px-3 py-2.5 text-sm font-semibold outline-none"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-[10px] font-black uppercase tracking-wider">Seed prompt</span>
              <textarea
                value={seedPrompt}
                onChange={(e) => setSeedPrompt(e.target.value)}
                maxLength={160}
                required
                rows={3}
                placeholder="What should every holder add?"
                className="mt-2 w-full resize-none border-[3px] border-black bg-[#fff8e7] px-3 py-2.5 text-sm font-semibold outline-none"
              />
            </label>

            <CoverPicker
              value={coverImageUrl}
              seed={creatureName || 'keepers'}
              onChange={(url) => {
                setCoverImageUrl(url);
                setCoverLocked(true);
              }}
            />

            <fieldset className="mt-4">
              <legend className="text-[10px] font-black uppercase tracking-wider">
                Pass window
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    [24, '24 hours'],
                    [168, '7 days'],
                    [720, '30 days'],
                  ] as const
                ).map(([hours, label]) => (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => setWindowHours(hours)}
                    className={`border-2 border-black px-3 py-2 text-xs font-black uppercase ${
                      windowHours === hours ? 'bg-[#d6ff00]' : 'bg-[#fff8e7]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] font-semibold text-black/70">
                Each holder gets this long to contribute and pass. Miss it and the Cell dies.
              </p>
            </fieldset>

            <fieldset className="mt-4">
              <legend className="text-[10px] font-black uppercase tracking-wider">Mode</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMode('return_home')}
                  className={`flex items-center gap-1.5 border-2 border-black px-3 py-2 text-xs font-black uppercase ${
                    mode === 'return_home' ? 'bg-[#ff4cbd]' : 'bg-[#fff8e7]'
                  }`}
                >
                  <Home className="h-3.5 w-3.5 stroke-[3]" />
                  Return home
                </button>
                <button
                  type="button"
                  onClick={() => setMode('open')}
                  className={`flex items-center gap-1.5 border-2 border-black px-3 py-2 text-xs font-black uppercase ${
                    mode === 'open' ? 'bg-[#ff4cbd]' : 'bg-[#fff8e7]'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 stroke-[3]" />
                  Open streak
                </button>
              </div>
            </fieldset>

            <label className="mt-4 block">
              <span className="text-[10px] font-black uppercase tracking-wider">
                Trophy at N holders
              </span>
              <input
                type="number"
                min={5}
                max={500}
                value={trophyGoal}
                onChange={(e) => setTrophyGoal(Number(e.target.value))}
                className="mt-2 w-full border-[3px] border-black bg-[#fff8e7] px-3 py-2.5 text-sm font-semibold outline-none"
              />
            </label>

            <div className="mt-5 border-t-[3px] border-black pt-4">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
                <Coins className="h-3.5 w-3.5 stroke-[3]" />
                Reward pot (PROOF)
              </p>
              <label className="mt-2 block">
                <span className="text-xs font-semibold">Seed the pot from your balance</span>
                <input
                  type="number"
                  min={0}
                  max={me.proofBalance}
                  value={initialProof}
                  onChange={(e) => setInitialProof(Number(e.target.value))}
                  className="mt-2 w-full border-[3px] border-black bg-[#fff8e7] px-3 py-2.5 text-sm font-semibold outline-none"
                />
              </label>
              <label className="mt-3 block">
                <span className="text-xs font-semibold">Pot note (optional)</span>
                <input
                  value={rewardPoolNote}
                  onChange={(e) => setRewardPoolNote(e.target.value)}
                  maxLength={120}
                  placeholder="What is this PROOF for?"
                  className="mt-2 w-full border-[3px] border-black bg-[#fff8e7] px-3 py-2.5 text-sm font-semibold outline-none"
                />
              </label>
            </div>

            {launch.error && (
              <p role="alert" className="mt-3 text-sm font-bold text-red-800">
                {launch.error.message}
              </p>
            )}

            <button
              type="submit"
              disabled={
                launch.isPending ||
                !creatureName.trim() ||
                !seedPrompt.trim() ||
                !selectedCommunityId
              }
              className="neo-button mt-5 flex w-full items-center justify-center gap-2 bg-[#224cff] px-4 py-3.5 text-sm font-black uppercase text-[#fff8e7] disabled:opacity-40"
            >
              {launch.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4 stroke-[3]" />
              )}
              {launch.isPending ? 'Sign mint in wallet…' : 'Launch · mint the Cell'}
            </button>
          </form>
        </div>
      )}
    </PageShell>
  );
}
