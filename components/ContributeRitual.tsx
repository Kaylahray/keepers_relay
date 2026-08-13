'use client';

import { useRef, useState } from 'react';
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
  onPublish,
}: {
  seedPrompt: string;
  alreadySealed: boolean;
  publishing: boolean;
  error: string | null;
  artifactRootOnChain?: boolean;
  artifactRoot?: string;
  onPublish: (input: {
    body: string;
    kind: ArtifactKind;
    place?: string;
    imageUrl?: string;
  }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState('');
  const [place, setPlace] = useState('');
  const [kind, setKind] = useState<ArtifactKind>('message');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const wantsImage = isImageMarkKind(kind);
  const canSubmit = wantsImage
    ? Boolean(imageUrl) && !publishing && !alreadySealed
    : Boolean(body.trim()) && !publishing && !alreadySealed;

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

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    onPublish({
      body: body.trim() || (wantsImage ? 'Image sealed' : ''),
      kind,
      place: place.trim() || undefined,
      imageUrl: wantsImage ? imageUrl || undefined : undefined,
    });
    setBody('');
    setPlace('');
    setImageUrl('');
  }

  if (alreadySealed) {
    return (
      <section className="border-[3px] border-black bg-[#d6ff00] p-5 text-black">
        <p className="text-[10px] font-black uppercase tracking-[0.16em]">Your mark is sealed</p>
        <p className="mt-2 font-poster text-3xl uppercase leading-none">Ready to pass</p>
        <p className="mt-3 text-sm font-semibold">
          {artifactRootOnChain
            ? 'artifact_root is on the live Chain Cell. Name the next Keeper.'
            : 'Mark is locked in the Living Artifact. The Cell picks up artifact_root when you pass.'}
        </p>
        {artifactRoot && (
          <p className="mt-2 break-all font-mono text-[10px] font-bold text-black/70">
            root {artifactRoot.slice(0, 18)}…
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="border-[3px] border-black bg-[#ffe454] p-5 text-black shadow-[8px_8px_0_#101010]">
      <p className="text-[10px] font-black uppercase tracking-[0.16em]">Your turn · seal one thing</p>
      <h2 className="mt-2 font-poster text-3xl uppercase leading-none">Leave a mark</h2>
      <p className="mt-3 text-sm font-semibold leading-relaxed">{seedPrompt}</p>

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
              className={`border-2 border-black px-2.5 py-1.5 text-xs font-bold ${
                kind === id ? 'bg-[#ff4cbd]' : 'bg-[#fff8e7]'
              }`}
            >
              <Icon className="mr-1 inline h-3.5 w-3.5 stroke-[3]" />
              {label}
            </button>
          ))}
        </div>

        {wantsImage && (
          <div className="border-[3px] border-black bg-[#fff8e7] p-3">
            <p className="text-[10px] font-black uppercase tracking-wider">
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
                  className="max-h-48 w-full border-2 border-black object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="absolute right-2 top-2 border-2 border-black bg-[#fff8e7] p-1"
                  aria-label="Remove image"
                >
                  <X className="h-4 w-4 stroke-[3]" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="neo-button mt-2 flex w-full items-center justify-center gap-2 bg-[#224cff] px-3 py-3 text-xs font-black uppercase text-[#fff8e7] disabled:opacity-40"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4 stroke-[3]" />
                )}
                {uploading ? 'Preparing…' : 'Upload image'}
              </button>
            )}
            {uploadError && (
              <p role="alert" className="mt-2 text-sm font-bold text-red-800">
                {uploadError}
              </p>
            )}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={180}
              placeholder="Optional caption…"
              className="mt-3 min-h-16 w-full resize-none border-[3px] border-black bg-white p-3 text-sm font-semibold outline-none"
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
            className="min-h-24 w-full resize-none border-[3px] border-black bg-[#fff8e7] p-3 text-sm font-semibold outline-none focus:bg-white"
          />
        )}

        <label className="block">
          <span className="sr-only">City stamp</span>
          <span className="relative block">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 stroke-[3]" />
            <input
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              maxLength={40}
              placeholder="City / place stamp (optional)"
              className="w-full border-[3px] border-black bg-[#fff8e7] py-2.5 pl-9 pr-3 text-sm font-semibold outline-none focus:bg-white"
            />
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm font-bold text-red-800">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="neo-button flex w-full items-center justify-center gap-2 bg-[#224cff] px-4 py-3.5 text-sm font-black uppercase text-[#fff8e7] disabled:opacity-40"
        >
          <Check className="h-4 w-4 stroke-[3]" />
          {publishing ? 'Sealing…' : 'Seal into the Cell'}
        </button>
      </form>
    </section>
  );
}
