'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { releaseBuilderName } from '@/lib/api/keeperApi';
import {
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
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
import Link from 'next/link';
import { ChainLoader } from '@/components/arena/ChainLoader';
import { Avatar } from '@/components/duel/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/kit';
import { ProfileShareLink } from '@/components/ProfileShareLink';
import { useUpsertBuilder } from '@/hooks/useBuilder';

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
  const upsert = useUpsertBuilder();
  const onChainProfile = useProfile();
  const onChainUsername = useUsername();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compressionNote, setCompressionNote] = useState<string | null>(null);
  // The studio has no bio field, so a save keeps the saved bio.
  const headline = builder?.headline ?? '';
  const [profileError, setProfileError] = useState<string | null>(null);
  const router = useRouter();
  // Releasing asks twice: the first tap arms it, the second signs.
  const [releaseArmed, setReleaseArmed] = useState(false);
  const [releasing, setReleasing] = useState(false);

  async function onRelease() {
    if (!address || releasing) return;
    if (!releaseArmed) {
      setReleaseArmed(true);
      return;
    }
    setProfileError(null);
    setReleasing(true);
    try {
      // On chain first: that is the name itself, and its CKB comes back to this wallet.
      await onChainUsername.release();
      await releaseBuilderName(address);
      router.push('/join');
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Could not release the username.');
      setReleaseArmed(false);
    } finally {
      setReleasing(false);
    }
  }
  const [settingSporeId, setSettingSporeId] = useState<string | null>(null);

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
    if (!sporeId) return;
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
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
      await syncAvatarOnChain(sporeId);
      await setAvatar.mutateAsync({ address, avatarSporeId: sporeId });
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Could not set that as your profile picture.');
    } finally {
      setSettingSporeId(null);
    }
  }

  if (!isConnected) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 md:px-8 md:pt-12">
        <EmptyState
          title="Connect first"
          body="Connect your wallet to mint a picture and set it as your profile picture."
          action={<Button onClick={() => void ensureAuth().catch(() => undefined)}>Connect wallet</Button>}
        />
      </div>
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
  const current = spore.mintedSpores.find((item) => item.id === profile.avatarSporeId)?.imageUrl ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 md:px-8 md:pt-12">
      <Link href="/profile" className="mb-6 inline-flex h-10 items-center gap-2 text-sm font-semibold text-mute hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Profile
      </Link>
      <h1 className="font-poster text-3xl font-black uppercase md:text-4xl">Edit profile</h1>
      {profile.username ? (
        <div className="mt-4">
          <ProfileShareLink username={profile.username} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-mute">
          No @handle yet.{' '}
          <Link href="/join?next=/profile/edit" className="font-semibold text-lime hover:underline">
            Claim one
          </Link>
          .
        </p>
      )}

      <section className="mt-8 rounded-3xl bg-ink-2 p-5 md:p-7" aria-labelledby="pic">
        <div className="flex items-center gap-5">
          <Avatar name={profile.username ? `@${profile.username}` : profile.displayName} tone="#99ee2d" size={80} src={previewUrl ?? current} />
          <div>
            <h2 id="pic" className="font-poster text-base font-bold uppercase">
              Profile picture
            </h2>
            <p className="mt-1 text-sm text-mute">Pick a look or upload your own, then mint it as a Spore NFT you own. One approval, and it stays yours.</p>
          </div>
        </div>

        <div role="radiogroup" aria-label="Ready-made looks" className="mt-6 grid grid-cols-4 gap-3 sm:grid-cols-8">
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
              className="grid aspect-square place-items-center rounded-2xl text-[10px] font-bold uppercase ring-offset-2 ring-offset-ink-2 transition-shadow duration-150 hover:ring-2 hover:ring-white/30"
              style={{ background: look.color, color: look.ink }}
            >
              {look.label}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-32 w-32 shrink-0 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-white/20 text-sm text-mute hover:border-white/40"
          >
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Your upload" className="h-full w-full object-cover" />
            ) : (
              <>
                <UploadCloud className="h-6 w-6" aria-hidden="true" /> Upload
              </>
            )}
          </button>
          <div className="flex-1">
            {compressionNote ? <p className="font-mono text-[11px] text-mute">{compressionNote}</p> : null}
            <Button variant="pink" className="mt-3" disabled={!selectedFile || spore.isMinting} onClick={() => void onMint()}>
              <Sparkles className="h-4 w-4" aria-hidden="true" /> {spore.isMinting ? 'Minting…' : 'Mint as avatar'}
            </Button>
            {spore.status.message ? (
              <p className={`mt-3 flex items-start gap-2 text-sm ${spore.status.type === 'error' ? 'text-danger' : 'text-lime'}`}>
                {spore.status.type === 'error' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
                {spore.status.message}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-3xl bg-ink-2 p-5 md:p-7" aria-labelledby="owned">
        <h2 id="owned" className="font-poster text-base font-bold uppercase">
          Pictures in this wallet
        </h2>
        <p className="mt-1 text-sm text-mute">Set one as your profile picture. Burning one gives its CKB back.</p>
        {spore.isLoadingSpores ? (
          <div className="mt-4">
            <ChainLoader compact title="Reading your pictures…" />
          </div>
        ) : spore.mintedSpores.length === 0 ? (
          <p className="mt-4 text-sm text-mute">No pictures in this wallet yet. Mint one above.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {spore.mintedSpores.map((item) => {
              const active = profile.avatarSporeId === item.id;
              const settingThis = settingSporeId === item.id;
              return (
                <article key={item.id} className={`rounded-2xl bg-ink p-2 ${active ? 'ring-2 ring-lime' : ''}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.imageUrl} alt="" className="aspect-square w-full rounded-xl object-cover" />
                  <p className="mt-2 truncate font-mono text-[10px] text-mute">
                    {item.ckbCapacity} CKB · {Math.round(item.sizeBytes / 1024)}KB
                  </p>
                  <div className="mt-2 flex flex-col gap-2">
                    <Button size="sm" variant={active ? 'ghost' : 'lime'} disabled={active || settingThis} onClick={() => void onSetAvatar(item.id)}>
                      {settingThis ? 'Setting…' : active ? 'Your picture' : 'Set as picture'}
                    </Button>
                    <Button size="sm" variant="outline" disabled={spore.deletingSporeId === item.id} onClick={() => void onDelete(item.id)}>
                      <Trash2 className="h-3 w-3" aria-hidden="true" /> Burn
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {profile.username ? (
        <section className="mt-6 rounded-3xl bg-ink-2 p-5 md:p-7" aria-labelledby="release">
          <h2 id="release" className="font-poster text-base font-bold uppercase">
            Release @{profile.username}
          </h2>
          <p className="mt-1 text-sm text-mute">
            Gives the name back so anyone can claim it, and returns the CKB it locked to your wallet. You will need a new name to play.
          </p>
          <Button variant={releaseArmed ? 'danger' : 'outline'} className="mt-4" disabled={releasing} onClick={() => void onRelease()}>
            {releasing ? 'Releasing…' : releaseArmed ? 'Tap again to release' : 'Release username'}
          </Button>
        </section>
      ) : null}
      {profileError ? <p className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{profileError}</p> : null}
    </div>
  );
}
