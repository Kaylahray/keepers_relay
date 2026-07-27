'use client';

import React, { useState } from 'react';
import {
  BookOpen,
  Check,
  Image as ImageIcon,
  MessageSquareQuote,
  Pin,
  Sparkles,
} from 'lucide-react';
import type { ArtifactKind, LivingArtifact } from '@/types/keeper';

interface ArtifactStudioProps {
  artifact: LivingArtifact;
  isKeeper: boolean;
  publishing: boolean;
  featuring: boolean;
  error: string | null;
  onPublish: (input: { body: string; kind: ArtifactKind }) => void;
  onFeature: (entryId: string) => void;
}

const MEME_RELIC_URL =
  'https://cdn.magicpatterns.com/patterns/generated-images/2ed6e98f-c9d8-4459-a593-e3c55bc9b87e.jpg';

const kinds: { id: ArtifactKind; label: string; Icon: typeof MessageSquareQuote }[] = [
  { id: 'message', label: 'Message', Icon: MessageSquareQuote },
  { id: 'meme', label: 'Meme line', Icon: ImageIcon },
  { id: 'rule', label: 'Rule', Icon: BookOpen },
];

export function ArtifactStudio({
  artifact,
  isKeeper,
  publishing,
  featuring,
  error,
  onPublish,
  onFeature,
}: ArtifactStudioProps) {
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<ArtifactKind>('message');
  const featured = artifact.entries.find((entry) => entry.isFeatured);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim() || publishing) return;
    onPublish({ body, kind });
    setBody('');
  }

  return (
    <section aria-labelledby="artifact-title" className="neo-card overflow-hidden bg-[#ffe454] p-0 text-black">
      <div className="grid md:grid-cols-[0.92fr_1.08fr]">
        <div className="relative min-h-[250px] border-b-[3px] border-black md:border-b-0 md:border-r-[3px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={MEME_RELIC_URL}
            alt="A surreal meme relic held in a bright red hand"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute left-3 top-3 border-2 border-black bg-[#ff4cbd] px-2 py-1 text-[10px] font-black uppercase tracking-wider">
            Permanent mark
          </div>
          <div className="absolute bottom-3 left-3 right-3 border-2 border-black bg-[#fff8e7] p-2.5">
            <p className="font-mono text-[10px] font-bold uppercase">
              Every keeper adds exactly one thing.
            </p>
          </div>
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-black">
                <Sparkles className="h-4 w-4 stroke-[3]" />
                <span className="text-[10px] font-black uppercase tracking-[0.16em]">
                  Living meme relic
                </span>
              </div>
              <h2 id="artifact-title" className="mt-2 font-poster text-3xl uppercase leading-[.92]">
                {artifact.title}
              </h2>
              <p className="mt-3 text-sm font-semibold leading-relaxed">{artifact.prompt}</p>
            </div>
            <span className="border-2 border-black bg-[#224cff] px-2 py-1 font-mono text-[10px] font-bold text-[#fff8e7]">
              {artifact.entries.length} MARKS
            </span>
          </div>
          {featured && (
            <div className="mt-5 border-[3px] border-black bg-[#fff8e7] p-3 shadow-[4px_4px_0_#101010]">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
                <Pin className="h-3 w-3 stroke-[3]" /> Community-kept mark
              </div>
              <p className="mt-2 font-serif-display text-2xl leading-none">“{featured.body}”</p>
              <p className="mt-2 font-mono text-[10px] font-bold">— {featured.author}</p>
            </div>
          )}
          {isKeeper ? (
            <form onSubmit={submit} className="mt-5 border-t-[3px] border-black pt-4">
              <div className="flex flex-wrap gap-2" aria-label="Artifact entry type">
                {kinds.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setKind(id)}
                    className={`border-2 border-black px-2.5 py-1.5 text-xs font-bold ${
                      kind === id ? 'bg-[#ff4cbd] text-black' : 'bg-[#fff8e7] text-black'
                    }`}
                  >
                    <Icon className="mr-1 inline h-3.5 w-3.5 stroke-[3]" />
                    {label}
                  </button>
                ))}
              </div>
              <label htmlFor="artifact-note" className="sr-only">
                Your permanent chain entry
              </label>
              <textarea
                id="artifact-note"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={180}
                placeholder="What should the next keeper carry forward?"
                className="mt-3 min-h-24 w-full resize-none border-[3px] border-black bg-[#fff8e7] p-3 text-sm font-semibold text-black outline-none placeholder:text-black/40 focus:bg-white"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] font-bold">{body.length}/180 · FOREVER</span>
                <button
                  type="submit"
                  disabled={!body.trim() || publishing}
                  className="neo-button flex items-center gap-1.5 bg-[#224cff] px-3.5 py-2 text-xs font-black text-[#fff8e7] disabled:opacity-40"
                >
                  {publishing ? (
                    'SEALING…'
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                      SEAL IT
                    </>
                  )}
                </button>
              </div>
              {error && (
                <p role="alert" className="mt-2 text-xs font-bold text-red-700">
                  {error}
                </p>
              )}
            </form>
          ) : (
            <p className="mt-5 border-2 border-black bg-[#fff8e7] p-3 text-xs font-semibold">
              The Keeper&rsquo;s pen unlocks only with the Cell. Complete a Relay or pledge to carry
              it next.
            </p>
          )}
        </div>
      </div>
      <div className="border-t-[3px] border-black bg-black px-5 py-4 text-[#fff8e7]">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d6ff00]">
          Fresh in the lineage
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[...artifact.entries]
            .reverse()
            .slice(0, 3)
            .map((entry) => (
              <div
                key={entry.id}
                className="flex min-w-0 flex-col justify-between border-2 border-[#fff8e7] p-2.5"
              >
                <p className="text-xs leading-snug">{entry.body}</p>
                <div className="mt-2 flex justify-between gap-2 font-mono text-[9px] font-bold text-[#d6ff00]">
                  <span>{entry.author}</span>
                  {isKeeper && !entry.isFeatured && (
                    <button
                      type="button"
                      onClick={() => onFeature(entry.id)}
                      disabled={featuring}
                      className="underline disabled:opacity-40"
                    >
                      FEATURE
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}
