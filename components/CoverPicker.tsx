'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import {
  COVER_PRESETS,
  fileToCoverDataUrl,
  isUsableCover,
  posterDataUri,
} from '@/lib/poster';

export function CoverPicker({
  value,
  onChange,
  seed,
  label = 'Cover · this is the Cell',
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
  const preview = value || posterDataUri(seed || 'keepers');

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
      setError('Paste an https:// image URL.');
      return;
    }
    setError(null);
    onChange(next);
  }

  return (
    <fieldset className="mt-4">
      <legend className="text-[10px] font-black uppercase tracking-wider">{label}</legend>
      <p className="mt-1 text-[11px] font-semibold text-black/70">
        Upload, paste a link, or pick a poster.
      </p>

      <div className="mt-3 grid grid-cols-[7.5rem_1fr] gap-3 sm:grid-cols-[9rem_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview}
          alt="Streak cover preview"
          className="h-24 w-full border-[3px] border-black object-cover sm:h-28"
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
            className="neo-button inline-flex items-center justify-center gap-1.5 bg-[#224cff] px-3 py-2 text-[10px] font-black uppercase text-[#fff8e7] disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5 stroke-[3]" />}
            Upload cover
          </button>
          <button
            type="button"
            onClick={() => onChange(posterDataUri(seed || 'keepers'))}
            className="border-2 border-black bg-[#fff8e7] px-3 py-1.5 text-[10px] font-black uppercase"
          >
            Generate from name
          </button>
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {COVER_PRESETS.map((preset) => {
          const src = posterDataUri(preset.id);
          const selected = value === src;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(src)}
              className={`shrink-0 border-[3px] ${selected ? 'border-[#ff4cbd]' : 'border-black'}`}
              title={preset.label}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={preset.label} className="h-12 w-16 object-cover" />
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={urlDraft}
          onChange={(event) => setUrlDraft(event.target.value)}
          placeholder="https://… image URL"
          className="min-w-0 flex-1 border-[3px] border-black bg-[#fff8e7] px-3 py-2 text-xs font-semibold outline-none"
        />
        <button
          type="button"
          onClick={applyUrl}
          className="border-2 border-black bg-white px-3 py-2 text-[10px] font-black uppercase"
        >
          Use URL
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs font-bold text-red-800">
          {error}
        </p>
      )}
    </fieldset>
  );
}
