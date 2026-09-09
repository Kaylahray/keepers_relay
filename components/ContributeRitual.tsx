'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  MapPin,
  MessageSquareQuote,
  Pin,
  X,
} from 'lucide-react';
import type { ArtifactKind } from '@/types/keeper';
import { isImageMarkKind } from '@/lib/artifact-commit';
import { fileToCoverDataUrl } from '@/lib/poster';

const kinds: { id: ArtifactKind; label: string; Icon: typeof MessageSquareQuote }[] = [
  { id: 'view', label: 'Image', Icon: ImageIcon },
  { id: 'message', label: 'Line', Icon: MessageSquareQuote },
  { id: 'stamp', label: 'Stamp', Icon: Pin },
  { id: 'meme', label: 'Meme', Icon: ImageIcon },
  { id: 'rule', label: 'Rule', Icon: BookOpen },
];

/** Holder ritual: seal one mark before the Cell can move. */
export function ContributeRitual({
  seedPrompt,
  alreadySealed,
  publishing,
  error,
  artifactRootOnChain,
  artifactRoot,
  draftInitial,
  savingDraft,
  allowSeal = true,
  onSaveDraft,
  onPublish,
}: {
  seedPrompt: string;
  alreadySealed: boolean;
  publishing: boolean;
  error: string | null;
  artifactRootOnChain?: boolean;
  artifactRoot?: string;
  draftInitial?: {
    body?: string;
    kind?: ArtifactKind;
    place?: string;
    imageUrl?: string;
  } | null;
  savingDraft?: boolean;
  allowSeal?: boolean;
  onSaveDraft?: (input: {
    body: string;
    kind: ArtifactKind;
    place?: string;
    imageUrl?: string;
  }) => void;
  onPublish: (input: {
    body: string;
    kind: ArtifactKind;
    place?: string;
    imageUrl?: string;
  }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState(draftInitial?.body ?? '');
  const [place, setPlace] = useState(draftInitial?.place ?? '');
  const [kind, setKind] = useState<ArtifactKind>(draftInitial?.kind ?? 'message');
  const [imageUrl, setImageUrl] = useState(draftInitial?.imageUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(!draftInitial);
  const wantsImage = isImageMarkKind(kind);
  const sealAllowed = allowSeal !== false;
  const canSubmit = sealAllowed
    ? wantsImage
      ? Boolean(imageUrl) && !publishing && !alreadySealed
      : Boolean(body.trim()) && !publishing && !alreadySealed
    : false;

  useEffect(() => {
    if (hydrated || !draftInitial) return;
    setBody(draftInitial.body ?? '');
    setPlace(draftInitial.place ?? '');
    setKind(draftInitial.kind ?? 'message');
    setImageUrl(draftInitial.imageUrl ?? '');
    setHydrated(true);
  }, [draftInitial, hydrated]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      setImageUrl(await fileToCoverDataUrl(file));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not use that image.');
    } finally {
      setUploading(false);
    }
  }

  // Keep what the Keeper typed/uploaded until the seal actually lands, so a
  // failed transaction doesn't wipe their image and caption.
  useEffect(() => {
    if (!alreadySealed) return;
    setBody('');
    setPlace('');
    setImageUrl('');
    setUploadError(null);
  }, [alreadySealed]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    onPublish({
      body: body.trim() || (wantsImage ? 'Image sealed' : ''),
      kind,
      place: place.trim() || undefined,
      imageUrl: wantsImage ? imageUrl || undefined : undefined,
    });
  }

  if (alreadySealed) {
    return (
      <section className="rounded-2xl border border-[#ff56f6]/40 bg-[#ff56f6]/10 p-5 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Your mark is sealed</p>
        <p className="mt-2 font-poster text-3xl uppercase leading-none">Ready to pass</p>
        <p className="mt-3 text-sm font-medium text-white/75">
          {artifactRootOnChain
            ? 'artifact_root is on the live Chain Cell. Name the next Keeper.'
            : 'Mark is locked in the Living Artifact. The Cell picks up artifact_root when you pass.'}
        </p>
        {artifactRoot && (
          <p className="mt-2 break-all font-mono text-[10px] font-bold text-white/45">
            root {artifactRoot.slice(0, 18)}…
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/15 bg-[#1a1628] p-5 text-white">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
        {sealAllowed ? 'Your turn · seal one thing' : 'Draft while you wait'}
      </p>
      <h2 className="mt-2 font-poster text-3xl uppercase leading-none">
        {sealAllowed ? 'Leave a mark' : 'Draft your mark'}
      </h2>
      <p className="mt-3 text-sm font-medium leading-relaxed text-white/70">{seedPrompt}</p>

      <form onSubmit={submit} className="mt-5 space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Mark type">
          {kinds.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setKind(id);
                if (!isImageMarkKind(id)) {
                  setImageUrl('');
                  setUploadError(null);
                }
              }}
              aria-pressed={kind === id}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
                kind === id
                  ? 'border-[#ff56f6] bg-[#ff56f6]/20 text-white'
                  : 'border-white/15 bg-white/5 text-white/70'
              }`}
            >
              <Icon className="mr-1 inline h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {wantsImage && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">
              {kind === 'meme' ? 'Meme image' : 'Image mark'}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            {imageUrl ? (
              <div className="relative mt-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Mark preview"
                  className="max-h-48 w-full rounded-lg object-contain"
                />
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="absolute right-2 top-2 rounded border border-white/20 bg-black/60 p-1"
                  aria-label="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="arena-cta mt-2 flex w-full items-center justify-center gap-2 rounded px-3 py-3 text-xs font-bold uppercase disabled:opacity-40"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                {uploading ? 'Preparing…' : 'Upload image'}
              </button>
            )}
            {uploadError && (
              <p role="alert" className="mt-2 text-sm font-bold text-[#ff56f6]">
                {uploadError}
              </p>
            )}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={180}
              placeholder="Optional caption…"
              className="mt-3 min-h-16 w-full resize-none rounded-lg border border-white/15 bg-black/30 p-3 text-sm font-medium text-white outline-none placeholder:text-white/35"
            />
          </div>
        )}

        {!wantsImage && (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={180}
            required
            placeholder="One line the next holder will see…"
            className="min-h-24 w-full resize-none rounded-lg border border-white/15 bg-black/30 p-3 text-sm font-medium text-white outline-none placeholder:text-white/35"
          />
        )}

        <label className="block">
          <span className="sr-only">City stamp</span>
          <span className="relative block">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              maxLength={40}
              placeholder="City / place stamp (optional)"
              className="w-full rounded-lg border border-white/15 bg-black/30 py-2.5 pl-9 pr-3 text-sm font-medium text-white outline-none placeholder:text-white/35"
            />
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm font-bold text-[#ff56f6]">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          {onSaveDraft ? (
            <button
              type="button"
              disabled={savingDraft || publishing}
              onClick={() =>
                onSaveDraft({
                  body: body.trim(),
                  kind,
                  place: place.trim() || undefined,
                  imageUrl: wantsImage ? imageUrl || undefined : undefined,
                })
              }
              className="flex flex-1 items-center justify-center gap-2 rounded border border-white/20 bg-white/5 px-4 py-3.5 text-sm font-bold uppercase text-white disabled:opacity-40"
            >
              {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save draft
            </button>
          ) : null}
          {sealAllowed ? (
            <button
              type="submit"
              disabled={!canSubmit}
              className="arena-cta flex flex-1 items-center justify-center gap-2 rounded px-4 py-3.5 text-sm font-bold uppercase disabled:opacity-40"
            >
              {publishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {publishing ? 'Sealing…' : 'Seal into the Cell'}
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
