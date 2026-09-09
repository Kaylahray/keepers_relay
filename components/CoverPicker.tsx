'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import {
  ARENA_COVERS,
  arenaCoverForSeed,
  fileToCoverDataUrl,
  isUsableCover,
} from '@/lib/poster';

export function CoverPicker({
  value,
  onChange,
  seed,
  label = 'Cover · pick arena art',
}: {
  value: string;
  onChange: (url: string) => void;
  seed: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const preview = value || arenaCoverForSeed(seed || 'keepers');

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await fileToCoverDataUrl(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that image.');
    } finally {
      setBusy(false);
    }
  }

  function applyUrl() {
    const next = urlDraft.trim();
    if (!isUsableCover(next)) {
      setError('Paste an https:// image URL or pick arena art.');
      return;
    }
    setError(null);
    onChange(next);
  }

  return (
    <fieldset className="mt-5">
      <legend className="text-[10px] font-bold uppercase tracking-wider text-white/45">
        {label}
      </legend>
      <p className="mt-1 text-[11px] font-medium text-white/55">
        Curated arena plates — upload or URL if you want your own. No generate.
      </p>

      <div className="mt-3 grid grid-cols-[7.5rem_1fr] gap-3 sm:grid-cols-[9rem_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview}
          alt="Cell cover preview"
          className="h-28 w-full rounded-xl border border-white/15 bg-black/40 object-contain sm:h-32"
        />
        <div className="flex flex-col justify-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="arena-cta inline-flex items-center justify-center gap-1.5 rounded px-3 py-2 text-[10px] font-bold uppercase disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
            Upload cover
          </button>
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {ARENA_COVERS.map((preset) => {
          const selected = value === preset.src;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(preset.src)}
              className={`shrink-0 overflow-hidden rounded-xl border-2 bg-black/40 ${
                selected ? 'border-[#ff56f6]' : 'border-white/15'
              }`}
              title={preset.label}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preset.src}
                alt={preset.label}
                className="h-16 w-14 object-contain object-bottom"
              />
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={urlDraft}
          onChange={(event) => setUrlDraft(event.target.value)}
          placeholder="https://… image URL"
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs font-medium text-white outline-none placeholder:text-white/35"
        />
        <button
          type="button"
          onClick={applyUrl}
          className="rounded-lg border border-white/20 px-3 py-2 text-[10px] font-bold uppercase text-white/80 hover:bg-white/5"
        >
          Use URL
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs font-bold text-[#ff56f6]">
          {error}
        </p>
      )}
    </fieldset>
  );
}
