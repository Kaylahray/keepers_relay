'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { releaseBuilderName } from '@/lib/api/keeperApi';
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Flame, Info, Loader2, Sparkles, UploadCloud } from 'lucide-react';
import { EASE } from '@/components/crowns/motion';
import { useSpore } from '@/hooks/useSpore';
import { useClearAvatarOnMelt, useMyBuilder, useSetAvatar } from '@/hooks/useBuilder';
import { useProfile } from '@/hooks/useProfile';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';
import { useAuth } from '@/context/auth-provider';
import { compressForProfile } from '@/lib/image/compress';
import { FACES } from '@/lib/crowns/art';
import Link from 'next/link';
import { ChainLoader } from '@/components/ui/ChainLoader';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/kit';
import { ProfileShareLink } from '@/components/ProfileShareLink';
import { useUpsertBuilder } from '@/hooks/useBuilder';

const MAX_BIO = 80;
const LOOK_NAMES = ['Nova', 'Pink Visor', 'Foxtrot', 'Teal', 'Bot', 'Tiger', 'Crown', 'Ghost'];

function Label({ children }: { children: string }) {
  return <p className="font-display text-sm font-extrabold uppercase tracking-wider text-fog">{children}</p>;
}

/** Side of a minted look, in pixels: big enough for any avatar on the site, a few KB to store. */
const LOOK_SIDE = 160;

/** A ready-made face as a small file to mint. Every byte on chain holds 1 CKB, so it's kept tiny. */
async function lookFile(src: string, name: string): Promise<File> {
  const image = new Image();
  image.src = src;
  await image.decode().catch(() => {
    throw new Error('Could not load that look.');
  });
  const canvas = document.createElement('canvas');
  canvas.width = LOOK_SIDE;
  canvas.height = LOOK_SIDE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare that look.');
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, LOOK_SIDE, LOOK_SIDE);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.7));
  if (!blob) throw new Error('Could not prepare that look.');
  return new File([blob], `${name.toLowerCase().replace(/\s/g, '-')}.webp`, { type: blob.type });
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
  // The bio as typed; null until edited, so it shows the saved one.
  const [bioDraft, setBioDraft] = useState<string | null>(null);
  const headline = bioDraft ?? builder?.headline ?? '';
  const [bioSaved, setBioSaved] = useState(false);
  const [mintingLook, setMintingLook] = useState<number | null>(null);
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

  async function onMintLook(i: number) {
    if (!address || spore.isMinting) return;
    setProfileError(null);
    setMintingLook(i);
    try {
      await spore.mintSpore(await lookFile(FACES[i]!, LOOK_NAMES[i]!));
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Could not create that look.');
    } finally {
      setMintingLook(null);
    }
  }

  async function onSaveBio() {
    if (!address || !builder) return;
    setProfileError(null);
    setBioSaved(false);
    try {
      await upsert.mutateAsync({ address, username: builder.username, displayName: builder.displayName, headline: headline.trim() });
      setBioDraft(null);
      setBioSaved(true);
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Could not save your bio.');
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
      <div className="mx-auto w-full max-w-[1100px] px-5 pt-6 sm:px-8 sm:pt-10">
        <EmptyState
          title="Connect first"
          body="Sign in to create a picture and set it as your profile picture."
          action={<Button onClick={() => void ensureAuth().catch(() => undefined)}>Sign in</Button>}
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
  const bioChanged = headline.trim() !== (builder?.headline ?? '');

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 pb-16 pt-6 sm:px-8 sm:pt-10">
      <Link href="/profile" className="inline-flex h-10 items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-fog transition-colors duration-150 hover:text-chalk">
        <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Profile
      </Link>
      <motion.h1
        initial={{ opacity: 0, x: -32 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="mt-3 font-display text-[56px] font-black uppercase leading-[0.85] sm:text-[88px]"
      >
        Edit profile
      </motion.h1>

      <section className="mt-10 grid gap-8 sm:grid-cols-[auto_1fr] sm:items-start">
        <motion.div key={current ?? 'none'} initial={{ scale: 0.94, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.2, ease: EASE }}>
          <Avatar
            name={profile.username ? `@${profile.username}` : profile.displayName}
            tone="#99ee2d"
            size={136}
            src={profile.avatarSporeId && spore.isLoadingSpores ? undefined : current}
          />
        </motion.div>
        <div className="min-w-0">
          {profile.username ? (
            <p className="truncate font-display text-4xl font-black leading-none">@{profile.username}</p>
          ) : (
            <p className="text-fog">
              No @name yet.{' '}
              <Link href="/join?next=/profile/edit" className="font-semibold text-lime hover:underline">
                Claim one
              </Link>
              .
            </p>
          )}
          {profile.username ? (
            <>
              <label htmlFor="bio" className="mt-6 block">
                <Label>Bio</Label>
              </label>
              <textarea
                id="bio"
                rows={2}
                value={headline}
                maxLength={MAX_BIO}
                onChange={(e) => {
                  setBioDraft(e.target.value);
                  setBioSaved(false);
                }}
                placeholder="Late braker. Harbour Loop is home."
                className="mt-2 w-full resize-none rounded-2xl border-2 border-line bg-ink-2 px-4 py-3 text-lg outline-none transition-colors duration-150 placeholder:text-fog/50 focus:border-lime"
              />
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="text-sm text-lime">{bioSaved ? 'Saved.' : ''}</span>
                <span className="text-sm tabular-nums text-fog">
                  {headline.length}/{MAX_BIO}
                </span>
              </div>
              <div className="mt-4">
                <ProfileShareLink username={profile.username} />
              </div>
            </>
          ) : null}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="owned">
        <h2 id="owned" className="font-display text-3xl font-black uppercase">
          Your pictures
        </h2>
        <p className="mt-1 text-fog">Your pictures. Set one as your profile picture.</p>
        {spore.isLoadingSpores ? (
          <ChainLoader compact title="Reading your pictures…" />
        ) : spore.mintedSpores.length === 0 ? (
          <p className="mt-5 rounded-3xl border border-dashed border-line px-6 py-10 text-center text-fog">No pictures yet. Create a look below, or upload your own.</p>
        ) : (
          <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {spore.mintedSpores.map((item) => {
              const on = profile.avatarSporeId === item.id;
              const settingThis = settingSporeId === item.id;
              return (
                <li key={item.id} className={`flex flex-col overflow-hidden rounded-3xl border bg-ink-2 transition-colors duration-150 ${on ? 'border-lime' : 'border-line'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.imageUrl} alt="" className="aspect-square w-full object-cover" />
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    {on ? (
                      <span className="flex h-11 items-center justify-center gap-2 font-display text-lg font-black uppercase text-lime">
                        <Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" /> In use
                      </span>
                    ) : (
                      <Button variant="ghost" size="sm" block disabled={settingThis || !profile.username} onClick={() => void onSetAvatar(item.id)}>
                        {settingThis ? 'Setting…' : 'Set as picture'}
                      </Button>
                    )}
                    <button
                      type="button"
                      className="mt-auto flex items-center justify-center gap-1.5 text-sm text-fog transition-colors duration-150 hover:text-pink disabled:opacity-40"
                      disabled={spore.deletingSporeId === item.id}
                      onClick={() => void onDelete(item.id)}
                    >
                      <Flame className="h-4 w-4" aria-hidden="true" /> {spore.deletingSporeId === item.id ? 'Burning…' : `Burn · get ${item.ckbCapacity} CKB back`}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-4 flex items-start gap-2 text-sm text-fog">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Each picture holds the CKB it takes to store it. Burn one and that CKB comes back to you.
        </p>
      </section>

      <section className="mt-14" aria-labelledby="looks">
        <h2 id="looks" className="font-display text-3xl font-black uppercase">
          Ready-made looks
        </h2>
        <p className="mt-1 text-fog">Create one you own. It costs a small CKB deposit, which you get back if you delete it.</p>
        {spore.isMinting ? (
          <p className="mt-3 flex items-center gap-2 font-semibold text-lime" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {mintingLook != null ? `Creating ${LOOK_NAMES[mintingLook]}. Confirm it when asked; the others wait until it’s done.` : 'Creating your picture. Confirm it when asked; the looks wait until it’s done.'}
          </p>
        ) : null}
        <ul className="-mx-5 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          {FACES.map((src, i) => (
            <motion.li
              key={src}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, ease: EASE, delay: i * 0.04 }}
              className="flex w-[46%] shrink-0 snap-start flex-col overflow-hidden rounded-3xl border border-line bg-ink-2 sm:w-auto"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="aspect-square w-full object-cover" />
              <div className="flex flex-1 flex-col p-3">
                <p className="font-display text-xl font-black uppercase leading-none">{LOOK_NAMES[i]}</p>
                <Button className="mt-3" size="sm" block variant={spore.isMinting && mintingLook !== i ? 'ghost' : 'lime'} disabled={spore.isMinting} onClick={() => void onMintLook(i)}>
                  {mintingLook === i ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Minting
                    </>
                  ) : spore.isMinting ? (
                    'One at a time'
                  ) : (
                    'Create'
                  )}
                </Button>
              </div>
            </motion.li>
          ))}
        </ul>

        <div className="mt-8 flex flex-col gap-4 rounded-3xl border border-line bg-ink-2 p-4 sm:flex-row sm:items-center sm:p-5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-28 w-28 shrink-0 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-line text-fog transition-colors duration-150 hover:border-chalk/50 hover:text-chalk"
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
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl font-black uppercase leading-none">Your own picture</p>
            {compressionNote ? <p className="mt-1 font-mono text-xs text-fog">{compressionNote}</p> : <p className="mt-1 text-fog">Upload any image and turn it into a picture you own.</p>}
            <Button variant="pink" className="mt-3" disabled={!selectedFile || spore.isMinting} onClick={() => void onMint()}>
              <Sparkles className="h-4 w-4" aria-hidden="true" /> {spore.isMinting && mintingLook == null ? 'Creating…' : 'Create my picture'}
            </Button>
          </div>
        </div>
        {spore.status.message ? (
          <p className={`mt-4 flex items-start gap-2 ${spore.status.type === 'error' ? 'text-danger' : 'text-lime'}`}>
            {spore.status.type === 'error' ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
            {spore.status.message}
          </p>
        ) : null}
      </section>

      {profile.username ? (
        <section className="mt-14 rounded-3xl border border-line p-5 sm:p-7" aria-labelledby="release">
          <h2 id="release" className="font-display text-2xl font-black uppercase">
            Release @{profile.username}
          </h2>
          <p className="mt-1 text-fog">Gives the name back so anyone can claim it, and returns the CKB it locked to your wallet. You will need a new name to play.</p>
          <Button variant={releaseArmed ? 'danger' : 'outline'} className="mt-4" disabled={releasing} onClick={() => void onRelease()}>
            {releasing ? 'Releasing…' : releaseArmed ? 'Tap again to release' : 'Release name'}
          </Button>
        </section>
      ) : null}
      {profileError ? <p className="mt-4 rounded-2xl bg-danger/10 p-4 text-danger">{profileError}</p> : null}

      {profile.username && bioChanged ? (
        <div className="sticky bottom-20 mt-12 flex justify-end md:bottom-6">
          <Button size="xl" disabled={upsert.isPending} onClick={() => void onSaveBio()} className="w-full shadow-[0_12px_40px_rgba(0,0,0,0.6)] sm:w-auto">
            {upsert.isPending ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
