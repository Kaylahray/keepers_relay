'use client';

import { useState } from 'react';
import {
  BookOpen,
  Check,
  Image as ImageIcon,
  MapPin,
  MessageSquareQuote,
  Pin,
} from 'lucide-react';
import type { ArtifactKind } from '@/types/keeper';

const kinds: { id: ArtifactKind; label: string; Icon: typeof MessageSquareQuote }[] = [
  { id: 'view', label: 'View', Icon: ImageIcon },
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
  onPublish,
}: {
  seedPrompt: string;
  alreadySealed: boolean;
  publishing: boolean;
  error: string | null;
  onPublish: (input: { body: string; kind: ArtifactKind; place?: string }) => void;
}) {
  const [body, setBody] = useState('');
  const [place, setPlace] = useState('');
  const [kind, setKind] = useState<ArtifactKind>('view');

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim() || publishing || alreadySealed) return;
    onPublish({ body, kind, place: place.trim() || undefined });
    setBody('');
    setPlace('');
  }

  if (alreadySealed) {
    return (
      <section className="border-[3px] border-black bg-[#d6ff00] p-5 text-black">
        <p className="text-[10px] font-black uppercase tracking-[0.16em]">Your mark is sealed</p>
        <p className="mt-2 font-poster text-3xl uppercase leading-none">Ready to pass</p>
        <p className="mt-3 text-sm font-semibold">
          The Cell can move. Name the next Keeper — or send it home if return-mode allows.
        </p>
      </section>
    );
  }

  return (
    <section className="border-[3px] border-black bg-[#ffe454] p-5 text-black shadow-[8px_8px_0_#101010]">
      <p className="text-[10px] font-black uppercase tracking-[0.16em]">Your turn · seal one thing</p>
      <h2 className="mt-2 font-poster text-3xl uppercase leading-none">Leave a mark</h2>
      <p className="mt-3 text-sm font-semibold leading-relaxed">{seedPrompt}</p>

      <form onSubmit={submit} className="mt-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          {kinds.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setKind(id)}
              className={`border-2 border-black px-2.5 py-1.5 text-xs font-bold ${
                kind === id ? 'bg-[#ff4cbd]' : 'bg-[#fff8e7]'
              }`}
            >
              <Icon className="mr-1 inline h-3.5 w-3.5 stroke-[3]" />
              {label}
            </button>
          ))}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={180}
          required
          placeholder="One line the next holder will see…"
          className="min-h-24 w-full resize-none border-[3px] border-black bg-[#fff8e7] p-3 text-sm font-semibold outline-none focus:bg-white"
        />
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
          disabled={!body.trim() || publishing}
          className="neo-button flex w-full items-center justify-center gap-2 bg-[#224cff] px-4 py-3.5 text-sm font-black uppercase text-[#fff8e7] disabled:opacity-40"
        >
          <Check className="h-4 w-4 stroke-[3]" />
          {publishing ? 'Sealing…' : 'Seal into the Cell'}
        </button>
      </form>
    </section>
  );
}
