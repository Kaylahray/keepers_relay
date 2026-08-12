'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useSpore } from '@/hooks/useSpore';
import { useClearAvatarOnMelt, useMyBuilder, useSetAvatar } from '@/hooks/useBuilder';
import { useProfile } from '@/hooks/useProfile';
import { useWallet } from '@/hooks/useWallet';
import { compressForProfile } from '@/lib/image/compress';
import { PageShell } from '@/components/PageShell';
import { ProfileShareLink } from '@/components/ProfileShareLink';
import { CharacterPicker } from '@/components/CharacterPicker';
import {
  KEEPER_BADGES,
  REWARD_LABELS,
  REWARD_POINTS,
  type RewardMilestone,
} from '@/lib/rewards/milestones';
import { useUnlockBadge, useUpsertBuilder } from '@/hooks/useBuilder';
import type { CharacterId } from '@/lib/characters';

export function ProfileStudioView() {
  const { address, isConnected, connect, formattedAddress } = useWallet();
  const myBuilder = useMyBuilder();
  const builder = myBuilder.data?.builder;
  const spore = useSpore();
  const setAvatar = useSetAvatar();
  const clearAvatar = useClearAvatarOnMelt();
  const unlock = useUnlockBadge();
  const upsert = useUpsertBuilder();
  const onChainProfile = useProfile();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compressionNote, setCompressionNote] = useState<string | null>(null);
  const [characterId, setCharacterId] = useState<CharacterId | null>(null);
  const [headline, setHeadline] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);

  useEffect(() => {
    if (builder) {
      setCharacterId(builder.characterId);
      setHeadline(builder.headline);
    }
  }, [builder]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const compressed = await compressForProfile(file);
    setSelectedFile(compressed.file);
    setCompressionNote(compressed.note);
    setPreviewUrl(URL.createObjectURL(compressed.file));
  }

  async function syncAvatarOnChain(avatarSporeId: string | null) {
    if (!builder || !onChainProfile.registryReady) return;
    await onChainProfile.save(
      {
        name: builder.displayName,
        headline: headline.trim() || onChainProfile.profile?.headline,
        bio: onChainProfile.profile?.bio,
        avatarSporeId: avatarSporeId ?? undefined,
        links: onChainProfile.profile?.links,
        skills: onChainProfile.profile?.skills,
      },
      builder.username,
    );
  }

  async function onMint() {
    if (!selectedFile || !address || !builder) return;
    const sporeId = await spore.mintSpore(selectedFile);
    if (sporeId) {
      try {
        await syncAvatarOnChain(sporeId);
      } catch (e) {
        setProfileError(e instanceof Error ? e.message : 'Failed to write avatar on-chain.');
      }
      setAvatar.mutate({ address, avatarSporeId: sporeId });
      setSelectedFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }

  async function onDelete(sporeId: string) {
    if (!address || !builder) return;
    if (builder.avatarSporeId === sporeId) {
      try {
        await syncAvatarOnChain(null);
      } catch (e) {
        setProfileError(e instanceof Error ? e.message : 'Failed to clear avatar on-chain.');
      }
      await clearAvatar.mutateAsync({ address, sporeId });
    }
    await spore.deleteImage(sporeId);
  }

  async function onSetAvatar(sporeId: string) {
    if (!address || !builder) return;
    setProfileError(null);
    try {
      await syncAvatarOnChain(sporeId);
      setAvatar.mutate({ address, avatarSporeId: sporeId });
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Failed to set avatar on-chain.');
    }
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!address || !builder) return;
    setProfileError(null);
    setProfileBusy(true);
    try {
      await onChainProfile.save(
        {
          name: builder.displayName,
          headline: headline.trim() || undefined,
          bio: onChainProfile.profile?.bio,
          avatarSporeId: builder.avatarSporeId ?? undefined,
          links: onChainProfile.profile?.links,
          skills: onChainProfile.profile?.skills,
        },
        builder.username,
      );
      await upsert.mutateAsync({
        address,
        username: builder.username,
        displayName: builder.displayName,
        characterId,
        headline,
        avatarSporeId: builder.avatarSporeId,
      });
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Profile save failed.');
    } finally {
      setProfileBusy(false);
    }
  }

  if (!isConnected) {
    return (
      <PageShell
        eyebrow="Profile studio"
        title="Mint who you are"
        intro="Connect your wallet to mint an avatar and unlock badges."
      >
        <button
          type="button"
          onClick={() => connect()}
          className="neo-button bg-[#d6ff00] px-5 py-3 text-sm font-black uppercase"
        >
          Connect wallet
        </button>
      </PageShell>
    );
  }

  if (!builder?.onboarded) {
    return (
      <PageShell
        eyebrow="Profile studio"
        title="Join first"
        intro="Claim your handle, then come back to mint an avatar."
        backHref="/"
      >
        <p className="font-mono text-xs font-bold">{formattedAddress}</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Profile studio"
      title={`@${builder.username}`}
      intro="Mint a Spore avatar, set it live, and collect PROOF."
      backHref="/builders"
      backLabel="Builders roster"
    >
      <div className="mb-6">
        <ProfileShareLink username={builder.username} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="neo-card bg-[#fff8e7] p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 stroke-[3]" />
            <h2 className="font-poster text-2xl uppercase leading-none">Mint Spore avatar</h2>
          </div>
          <p className="mt-2 text-xs font-semibold text-black/70">
            Images mint as on-chain Spores. Melt a Spore to remove it.
          </p>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative mt-4 aspect-square w-full max-w-xs border-[4px] border-black bg-[#ffe454]"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickFile}
            />
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2">
                <UploadCloud className="h-8 w-8 stroke-[3]" />
                <span className="text-[10px] font-black uppercase">Choose image</span>
              </div>
            )}
          </button>
          {compressionNote && (
            <p className="mt-2 font-mono text-[10px] font-bold">{compressionNote}</p>
          )}

          <button
            type="button"
            onClick={() => void onMint()}
            disabled={!selectedFile || spore.isMinting}
            className="neo-button mt-4 flex w-full max-w-xs items-center justify-center gap-2 bg-[#224cff] px-4 py-3 text-sm font-black uppercase text-[#fff8e7] disabled:opacity-40"
          >
            {spore.isMinting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 stroke-[3]" />
            )}
            {spore.isMinting ? 'Minting…' : 'Mint & set as avatar'}
          </button>

          {spore.status.message && (
            <p
              className={`mt-3 flex items-start gap-2 text-xs font-bold ${
                spore.status.type === 'error' ? 'text-red-800' : 'text-black'
              }`}
            >
              {spore.status.type === 'error' ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              {spore.status.message}
            </p>
          )}
        </section>

        <section className="neo-card bg-[#224cff] p-5 text-[#fff8e7]">
          <h2 className="font-poster text-2xl uppercase leading-none">Your Spores</h2>
          <p className="mt-2 text-xs font-bold text-[#d6ff00]">
            Active avatar:{' '}
            {builder.avatarSporeId
              ? `${builder.avatarSporeId.slice(0, 14)}…`
              : 'none'}
          </p>

          {spore.isLoadingSpores ? (
            <div className="mt-4 h-40 animate-pulse border-[3px] border-[#fff8e7] bg-[#ff4cbd]" />
          ) : spore.mintedSpores.length === 0 ? (
            <p className="mt-4 text-sm font-semibold">No Spores in this wallet yet. Mint one.</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {spore.mintedSpores.map((item) => {
                const active = builder.avatarSporeId === item.id;
                return (
                  <article
                    key={item.id}
                    className={`border-[3px] border-black bg-[#fff8e7] p-2 text-black ${
                      active ? 'shadow-[5px_5px_0_#d6ff00]' : ''
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="aspect-square w-full border-2 border-black object-cover"
                    />
                    <p className="mt-1 truncate font-mono text-[9px] font-bold">
                      {item.ckbCapacity} CKB · {Math.round(item.sizeBytes / 1024)}KB
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <button
                        type="button"
                        disabled={active || setAvatar.isPending || onChainProfile.isSaving}
                        onClick={() => void onSetAvatar(item.id)}
                        className="border-2 border-black bg-[#d6ff00] px-2 py-1 text-[9px] font-black uppercase disabled:opacity-40"
                      >
                        {active ? 'Active' : 'Use'}
                      </button>
                      <button
                        type="button"
                        disabled={spore.deletingSporeId === item.id}
                        onClick={() => void onDelete(item.id)}
                        className="flex items-center gap-1 border-2 border-black bg-[#ff4cbd] px-2 py-1 text-[9px] font-black uppercase disabled:opacity-40"
                      >
                        <Trash2 className="h-3 w-3" />
                        Melt
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <form
        onSubmit={(e) => void saveProfile(e)}
        className="mt-6 neo-card bg-[#ffe454] p-5"
      >
        <h2 className="font-poster text-2xl uppercase leading-none">Edit profile</h2>
        <p className="mt-2 text-xs font-semibold">
          Saves your on-chain profile for <strong>@{builder.username}</strong>.
        </p>
        <label className="mt-4 block">
          <span className="text-[10px] font-black uppercase tracking-wider">Headline</span>
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            maxLength={80}
            className="mt-2 w-full border-[3px] border-black bg-[#fff8e7] px-3 py-2.5 text-sm font-semibold outline-none"
          />
        </label>
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-black uppercase tracking-wider">Cast vibe</p>
          <CharacterPicker value={characterId} onChange={setCharacterId} />
        </div>
        {profileError && (
          <p role="alert" className="mt-3 text-sm font-bold text-red-800">
            {profileError}
          </p>
        )}
        <button
          type="submit"
          disabled={profileBusy || upsert.isPending || onChainProfile.isSaving}
          className="neo-button mt-4 flex items-center gap-2 bg-[#224cff] px-4 py-3 text-xs font-black uppercase text-[#fff8e7] disabled:opacity-40"
        >
          {(profileBusy || onChainProfile.isSaving) && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          {profileBusy || onChainProfile.isSaving
            ? 'Signing profile tx…'
            : 'Save profile on-chain'}
        </button>
      </form>

      <RewardsPanel
        proofBalance={builder.proofBalance}
        claimedMilestones={builder.claimedMilestones}
        claimedBadgeIds={builder.claimedBadgeIds}
        onUnlock={(badgeId) => address && unlock.mutate({ address, badgeId })}
        unlocking={unlock.isPending}
      />
    </PageShell>
  );
}

function RewardsPanel({
  proofBalance,
  claimedMilestones,
  claimedBadgeIds,
  onUnlock,
  unlocking,
}: {
  proofBalance: number;
  claimedMilestones: RewardMilestone[];
  claimedBadgeIds: string[];
  onUnlock: (badgeId: string) => void;
  unlocking: boolean;
}) {
  return (
    <section className="mt-6 neo-card bg-black p-5 text-[#fff8e7]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d6ff00]">
            Keepers PROOF
          </p>
          <h2 className="mt-1 font-poster text-4xl uppercase leading-none">{proofBalance} PROOF</h2>
          <p className="mt-2 max-w-xl text-xs font-semibold text-[#fff8e7]/80">
            Earned by keeping Cells alive and completing relays.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {(Object.keys(REWARD_POINTS) as RewardMilestone[]).map((milestone) => {
          const earned = claimedMilestones.includes(milestone);
          return (
            <div
              key={milestone}
              className={`border-2 border-[#fff8e7] p-3 ${earned ? 'bg-[#d6ff00] text-black' : 'bg-transparent'}`}
            >
              <p className="text-[10px] font-black uppercase">{REWARD_LABELS[milestone]}</p>
              <p className="mt-1 font-mono text-sm font-bold">
                +{REWARD_POINTS[milestone]} · {earned ? 'Earned' : 'Locked'}
              </p>
            </div>
          );
        })}
      </div>

      <h3 className="mt-6 font-poster text-2xl uppercase leading-none text-[#d6ff00]">Badges</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {KEEPER_BADGES.map((badge) => {
          const owned = claimedBadgeIds.includes(badge.id);
          const canUnlock = !owned && proofBalance >= badge.requiredProof;
          return (
            <motion.div
              key={badge.id}
              className="border-[3px] border-black p-3 text-black"
              style={{ backgroundColor: badge.accent }}
            >
              <p className="font-poster text-xl uppercase leading-none">{badge.name}</p>
              <p className="mt-1 font-mono text-[10px] font-bold">
                Unlock at {badge.requiredProof} PROOF
              </p>
              {owned ? (
                <span className="mt-2 inline-block border-2 border-black bg-black px-2 py-1 text-[9px] font-black uppercase text-[#d6ff00]">
                  Owned
                </span>
              ) : (
                <button
                  type="button"
                  disabled={!canUnlock || unlocking}
                  onClick={() => onUnlock(badge.id)}
                  className="neo-button mt-2 bg-black px-2.5 py-1.5 text-[9px] font-black uppercase text-[#fff8e7] disabled:opacity-40"
                >
                  Unlock
                </button>
              )}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
