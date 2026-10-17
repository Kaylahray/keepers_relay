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
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';
import { useAuth } from '@/context/auth-provider';
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

const LOOKS = [
  { id: 'lime', label: 'Lime', color: '#99ee2d', ink: '#111111' },
  { id: 'red', label: 'Red', color: '#af2a3a', ink: '#fff8e7' },
  { id: 'amber', label: 'Amber', color: '#e1bf47', ink: '#111111' },
  { id: 'night', label: 'Night', color: '#111111', ink: '#99ee2d' },
] as const;

async function portraitFile(look: (typeof LOOKS)[number]): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not draw a picture.');
  ctx.fillStyle = look.color;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = look.ink;
  ctx.font = '700 140px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(look.label.slice(0, 1), 128, 140);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not prepare that picture.');
  return new File([blob], `${look.id}.png`, { type: 'image/png' });
}

export function ProfileStudioView() {
  const { address, isConnected, formattedAddress } = useWallet();
  const { ensureAuth, authenticated, address: sessionAddress } = useAuth();
  const myBuilder = useMyBuilder();
  const builder = myBuilder.data?.builder;
  const spore = useSpore();
  const setAvatar = useSetAvatar();
  const clearAvatar = useClearAvatarOnMelt();
  const unlock = useUnlockBadge();
  const upsert = useUpsertBuilder();
  const onChainProfile = useProfile();
  const onChainUsername = useUsername();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compressionNote, setCompressionNote] = useState<string | null>(null);
  const [characterId, setCharacterId] = useState<CharacterId | null>(null);
  const [headline, setHeadline] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [settingSporeId, setSettingSporeId] = useState<string | null>(null);

  const handle = builder?.username || onChainUsername.username?.username;

  useEffect(() => {
    if (builder) {
      setCharacterId(builder.characterId);
      setHeadline(builder.headline);
    }
  }, [builder]);

  const profileAttempt = useRef<string | null>(null);

  useEffect(() => {
    if (!address || !authenticated || sessionAddress !== address.toLowerCase()) return;
    if (!myBuilder.isFetched || upsert.isPending) return;
    const claimed = onChainUsername.username?.username || '';
    if (builder && (builder.onboarded || !claimed)) return;
    const key = `${address.toLowerCase()}|${claimed}|${builder ? '1' : '0'}`;
    if (profileAttempt.current === key) return;
    profileAttempt.current = key;
    void upsert
      .mutateAsync({
        address,
        username: claimed || builder?.username || '',
        displayName: claimed || builder?.displayName || formattedAddress || 'Player',
      })
      .catch((error) => {
        setProfileError(error instanceof Error ? error.message : 'Profile sync failed.');
      });
  }, [
    address,
    authenticated,
    builder,
    formattedAddress,
    myBuilder.isFetched,
    onChainUsername.username?.username,
    sessionAddress,
    upsert,
  ]);

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
    if (!selectedFile || !address) return;
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
    if (!address) return;
    if (builder?.avatarSporeId === sporeId) {
      try {
        await clearAvatar.mutateAsync({ address, sporeId });
      } catch (e) {
        setProfileError(e instanceof Error ? e.message : 'The picture was burned, but the profile still pointed at it.');
      }
    }
    await spore.deleteImage(sporeId);
  }

  async function onSetAvatar(sporeId: string) {
    if (!address || settingSporeId) return;
    setProfileError(null);
    setSettingSporeId(sporeId);
    try {
      await setAvatar.mutateAsync({ address, avatarSporeId: sporeId });
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Could not set that as your profile picture.');
    } finally {
      setSettingSporeId(null);
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
        intro="Connect your wallet to mint an avatar. The picture shows on your profile after you set it."
      >
        <button
          type="button"
          onClick={() => void ensureAuth().catch(() => undefined)}
          className="neo-button bg-[#d6ff00] px-5 py-3 text-sm font-black uppercase"
        >
          Connect wallet
        </button>
      </PageShell>
    );
  }

  const profile = builder ?? {
    address,
    username: '',
    displayName: formattedAddress || 'You',
    characterId: null,
    avatarSporeId: null,
    headline: '',
    joinedAt: '',
    lastSeenAt: '',
    onboarded: false,
    pointsBalance: 0,
    claimedMilestones: [],
    claimedBadgeIds: [],
  };

  const studioTitle = profile.username ? `@${profile.username}` : 'Your picture';

  return (
    <PageShell
      eyebrow="Profile studio"
      title={studioTitle}
      intro="Mint a Spore picture, then set it. It shows on your profile."
      backHref="/profile"
      backLabel="Profile"
    >
      {profile.username ? (
        <div className="mb-6">
          <ProfileShareLink username={profile.username} />
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="neo-card bg-[#fff8e7] p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 stroke-[3]" />
            <h2 className="font-poster text-2xl uppercase leading-none">Mint Spore avatar</h2>
          </div>
          <p className="mt-2 text-xs font-semibold text-black/70">
            Upload a picture from this device, or pick one below if you do not have a file. Then mint it and set it as your profile picture.
          </p>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {LOOKS.map((look) => (
              <button
                key={look.id}
                type="button"
                onClick={() => {
                  void portraitFile(look)
                    .then((file) => {
                      if (previewUrl) URL.revokeObjectURL(previewUrl);
                      setSelectedFile(file);
                      setPreviewUrl(URL.createObjectURL(file));
                      setCompressionNote(null);
                    })
                    .catch((error) => {
                      setProfileError(error instanceof Error ? error.message : 'Could not use that picture.');
                    });
                }}
                className="aspect-square border-[3px] border-black text-xs font-black uppercase"
                style={{ background: look.color, color: look.ink }}
              >
                {look.label}
              </button>
            ))}
          </div>

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
            {spore.isMinting ? 'Mintingâ€¦' : 'Mint & set as avatar'}
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
          <h2 className="font-poster text-2xl uppercase leading-none">Pictures in this wallet</h2>
          <p className="mt-2 text-xs font-bold text-[#d6ff00]">
            These are Spores this wallet already holds, not other players. Use one as your profile picture, or burn it.
          </p>
          <p className="mt-2 text-xs font-bold text-[#fff8e7]">
            Profile picture:{' '}
            {profile.avatarSporeId ? `${profile.avatarSporeId.slice(0, 14)}â€¦` : 'not set'}
          </p>

          {spore.isLoadingSpores ? (
            <div className="mt-4 h-40 animate-pulse border-[3px] border-[#fff8e7] bg-[#ff4cbd]" />
          ) : spore.mintedSpores.length === 0 ? (
            <p className="mt-4 text-sm font-semibold">No Spores in this wallet yet. Mint one.</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {spore.mintedSpores.map((item) => {
                const active = profile.avatarSporeId === item.id;
                const settingThis = settingSporeId === item.id;
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
                      {item.ckbCapacity} CKB Â· {Math.round(item.sizeBytes / 1024)}KB
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <button
                        type="button"
                        disabled={active || settingThis}
                        onClick={() => void onSetAvatar(item.id)}
                        className="cursor-pointer border-2 border-black bg-[#d6ff00] px-2 py-1 text-[9px] font-black uppercase disabled:cursor-default disabled:opacity-40"
                      >
                        {settingThis ? 'Setting…' : active ? 'Profile pic' : 'Use as profile pic'}
                      </button>
                      <button
                        type="button"
                        disabled={spore.deletingSporeId === item.id}
                        onClick={() => void onDelete(item.id)}
                        className="flex cursor-pointer items-center gap-1 border-2 border-black bg-[#ff4cbd] px-2 py-1 text-[9px] font-black uppercase disabled:cursor-default disabled:opacity-40"
                      >
                        <Trash2 className="h-3 w-3" />
                        Burn
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
      {profileError ? <p className="mt-4 text-sm font-bold text-[#af2a3a]">{profileError}</p> : null}
    </PageShell>
  );
}
