'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Sparkles, WalletMinimal, X } from 'lucide-react';
import { useMyBuilder, useUpsertBuilder, useUsernameCheck } from '@/hooks/useBuilder';
import { useUsername } from '@/hooks/useUsername';
import { useProfile } from '@/hooks/useProfile';
import { useWallet } from '@/hooks/useWallet';
import { CharacterPicker } from '@/components/CharacterPicker';
import type { CharacterId } from '@/lib/characters';
import { normalizeUsername } from '@/lib/rewards/milestones';
import { registryConfigured } from '@/lib/registry/config';
import { estimateUsernameCapacityCkb } from '@/lib/registry/capacity';

/**
 * Connect → on-chain username (claim or reuse) → profile → local roster sync.
 * If this wallet already owns an on-chain @handle, we never re-claim it.
 */
export function OnboardingModal() {
  const { isConnected, address, formattedAddress, isReady } = useWallet();
  const myBuilder = useMyBuilder();
  const upsert = useUpsertBuilder();
  const {
    claim,
    username: onChainUsername,
    isLoading: usernameLoading,
  } = useUsername();
  const { save, profile: onChainProfile } = useProfile();

  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [headline, setHeadline] = useState('');
  const [characterId, setCharacterId] = useState<CharacterId | null>(null);
  const [phase, setPhase] = useState<'idle' | 'username' | 'profile' | 'roster'>('idle');
  const [error, setError] = useState<string | null>(null);

  const alreadyHasHandle = Boolean(onChainUsername?.username);
  const check = useUsernameCheck(username);
  // Returning wallets already own an on-chain @handle. Roster sync is silent
  // (OnChainIdentitySync) — do not pop the claim/profile modal again.
  const needsOnboarding =
    isReady &&
    isConnected &&
    !!address &&
    myBuilder.isFetched &&
    !myBuilder.data?.builder?.onboarded &&
    !usernameLoading &&
    !alreadyHasHandle;

  useEffect(() => {
    if (needsOnboarding) setOpen(true);
  }, [needsOnboarding]);

  useEffect(() => {
    if (onChainUsername?.username) {
      setUsername(onChainUsername.username);
    }
    if (onChainProfile?.name) {
      setDisplayName(onChainProfile.name);
      setHeadline(onChainProfile.headline ?? '');
    }
  }, [onChainUsername, onChainProfile]);

  if (!open || !needsOnboarding) return null;

  const normalized = normalizeUsername(username);
  const capacityHint =
    !alreadyHasHandle && normalized.length >= 3
      ? `~${estimateUsernameCapacityCkb(normalized).toFixed(2)} CKB`
      : null;
  const usernameOk =
    alreadyHasHandle ||
    (check.data?.available === true) ||
    (onChainUsername?.username === normalized);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!address || !username.trim() || !displayName.trim() || phase !== 'idle') return;
    if (!alreadyHasHandle && check.data && !check.data.available) return;

    setError(null);

    if (!registryConfigured()) {
      setError(
        'Couldn’t reach the username registry. Try again in a moment.',
      );
      return;
    }

    const handle = alreadyHasHandle
      ? onChainUsername!.username
      : normalizeUsername(username);

    try {
      // 1) Username cell — only if this wallet does not already own one
      if (!alreadyHasHandle) {
        setPhase('username');
        await claim(handle);
      }

      // 2) Profile cell — create or update (spend CKB only when writing)
      setPhase('profile');
      await save(
        {
          name: displayName.trim(),
          headline: headline.trim() || undefined,
          avatarSporeId: onChainProfile?.avatarSporeId,
        },
        handle,
      );

      // 3) Keepers roster cache
      setPhase('roster');
      await upsert.mutateAsync({
        address,
        username: handle,
        displayName: displayName.trim(),
        characterId,
        headline,
        avatarSporeId: onChainProfile?.avatarSporeId ?? null,
      });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'On-chain join failed.');
    } finally {
      setPhase('idle');
    }
  }

  const busy = phase !== 'idle';
  const statusLabel =
    phase === 'username'
      ? 'Claiming username on-chain…'
      : phase === 'profile'
        ? alreadyHasHandle
          ? 'Updating profile cell…'
          : 'Creating profile cell…'
        : phase === 'roster'
          ? 'Syncing…'
          : alreadyHasHandle
            ? `Continue as @${onChainUsername?.username}`
            : 'Join';

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/75" aria-hidden="true" />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboard-title"
          className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto border-[4px] border-black bg-[#ffe454] p-5 text-black shadow-[12px_12px_0_#ff4cbd] sm:p-7"
          initial={{ scale: 0.92, y: 12 }}
          animate={{ scale: 1, y: 0 }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em]">Join the crew</p>
              <h2
                id="onboard-title"
                className="mt-2 font-poster text-4xl uppercase leading-[.85] sm:text-5xl"
              >
                {alreadyHasHandle ? (
                  <>
                    Welcome back,
                    <br />@{onChainUsername?.username}.
                  </>
                ) : (
                  <>
                    Claim your
                    <br />
                    handle.
                  </>
                )}
              </h2>
              <p className="mt-3 max-w-xl text-sm font-semibold leading-relaxed">
                {alreadyHasHandle
                  ? 'Confirm your display name and you’re in.'
                  : 'Pick an @handle. Your wallet signs it on-chain.'}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="border-2 border-black bg-[#fff8e7] p-1"
            >
              <X className="h-5 w-5 stroke-[3]" />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 border-2 border-black bg-black px-2.5 py-1.5 font-mono text-[10px] font-bold text-[#d6ff00]">
              <WalletMinimal className="h-3.5 w-3.5 stroke-[3]" />
              {formattedAddress || address}
            </div>
            {alreadyHasHandle && (
              <span className="border-2 border-black bg-[#224cff] px-2 py-1 text-[10px] font-black uppercase text-[#fff8e7]">
                @{onChainUsername?.username}
              </span>
            )}
          </div>

          <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.16em]">
                  Username
                </span>
                <div className="relative mt-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-bold">
                    @
                  </span>
                  <input
                    value={username}
                    onChange={(event) => {
                      if (alreadyHasHandle) return;
                      setUsername(event.target.value.toLowerCase());
                    }}
                    maxLength={32}
                    placeholder="your_handle"
                    className="w-full border-[3px] border-black bg-[#fff8e7] py-3 pl-8 pr-3 text-sm font-semibold outline-none focus:bg-white disabled:opacity-70"
                    required
                    disabled={busy || alreadyHasHandle}
                    readOnly={alreadyHasHandle}
                  />
                </div>
                {alreadyHasHandle ? (
                  <p className="mt-1 text-[10px] font-bold text-green-800">
                    This is your on-chain handle
                  </p>
                ) : (
                  username.length >= 3 &&
                  check.data && (
                    <p
                      className={`mt-1 text-[10px] font-bold ${
                        check.data.available ? 'text-green-800' : 'text-red-800'
                      }`}
                    >
                      {check.data.available
                        ? `@${check.data.username} is available${capacityHint ? ` · locks ${capacityHint}` : ''}`
                        : check.data.reason}
                    </p>
                  )
                )}
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.16em]">
                  Display name
                </span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={64}
                  placeholder="What Keepers call you"
                  className="mt-2 w-full border-[3px] border-black bg-[#fff8e7] px-3 py-3 text-sm font-semibold outline-none focus:bg-white"
                  required
                  disabled={busy}
                />
              </label>
            </div>

            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-[0.16em]">
                One-line pledge
              </span>
              <input
                value={headline}
                onChange={(event) => setHeadline(event.target.value)}
                maxLength={80}
                placeholder="Why are you here this week?"
                className="mt-2 w-full border-[3px] border-black bg-[#fff8e7] px-3 py-3 text-sm font-semibold outline-none focus:bg-white"
                disabled={busy}
              />
            </label>

            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em]">
                Optional cast vibe
              </p>
              <CharacterPicker value={characterId} onChange={setCharacterId} />
            </div>

            {error && (
              <p role="alert" className="text-sm font-bold text-red-800">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={
                busy ||
                !username.trim() ||
                !displayName.trim() ||
                (!alreadyHasHandle && !usernameOk)
              }
              className="neo-button flex w-full items-center justify-center gap-2 bg-[#224cff] px-4 py-3.5 text-sm font-black uppercase text-[#fff8e7] disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 stroke-[3]" />
              )}
              {statusLabel}
            </button>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
