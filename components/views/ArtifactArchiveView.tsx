'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { BookOpen, Image as ImageIcon, MessageSquareQuote, Pin } from 'lucide-react';
import { useKeeperEcosystem } from '@/hooks/useKeeperEcosystem';
import { PageShell } from '@/components/PageShell';
import type { ArtifactKind } from '@/types/keeper';

const KIND: Record<ArtifactKind, { label: string; bg: string; Icon: typeof BookOpen }> = {
  message: { label: 'Message', bg: '#ffe454', Icon: MessageSquareQuote },
  meme: { label: 'Meme line', bg: '#ff4cbd', Icon: ImageIcon },
  rule: { label: 'Rule', bg: '#d6ff00', Icon: BookOpen },
  view: { label: 'View', bg: '#224cff', Icon: ImageIcon },
  stamp: { label: 'Stamp', bg: '#fff8e7', Icon: Pin },
};

export function ArtifactArchiveView({ chainId }: { chainId: string }) {
  const { artifact } = useKeeperEcosystem();

  if (artifact.isLoading || !artifact.data) {
    return (
      <PageShell
        eyebrow="Living artifact"
        title="Loading archive"
        backHref={`/chains/${chainId}`}
        backLabel="Chain record"
      >
        <div className="h-64 animate-pulse border-[3px] border-black bg-[#ff4cbd]" />
      </PageShell>
    );
  }

  const entries = [...artifact.data.entries].reverse();

  return (
    <PageShell
      eyebrow="Living artifact"
      title={artifact.data.title}
      intro={`${artifact.data.prompt} Every Keeper gets exactly one mark. Nothing here can be edited or deleted — this is the cultural record the Cell carries forward.`}
      backHref={`/chains/${chainId}`}
      backLabel="Chain record"
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="border-[3px] border-black bg-[#224cff] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#fff8e7]">
          {entries.length} permanent marks
        </span>
        <Link
          href="/"
          className="border-[3px] border-black bg-[#fff8e7] px-3 py-2 text-[10px] font-black uppercase tracking-wider"
        >
          Add yours as Keeper
        </Link>
      </div>

      <ol className="relative space-y-4 border-l-[3px] border-black pl-6">
        {entries.map((entry) => {
          const kind = KIND[entry.kind];
          return (
            <li key={entry.id} className="relative">
              <span
                className="absolute -left-[34px] top-3 flex h-6 w-6 items-center justify-center border-[3px] border-black"
                style={{ backgroundColor: kind.bg }}
                aria-hidden="true"
              >
                <kind.Icon className="h-3 w-3 stroke-[3]" />
              </span>
              <article className="neo-card bg-[#fff8e7] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black pb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="border-2 border-black px-2 py-0.5 text-[10px] font-black uppercase"
                      style={{ backgroundColor: kind.bg }}
                    >
                      {kind.label}
                    </span>
                    {entry.isFeatured && (
                      <span className="flex items-center gap-1 border-2 border-black bg-black px-2 py-0.5 text-[10px] font-black uppercase text-[#d6ff00]">
                        <Pin className="h-3 w-3 stroke-[3]" />
                        Featured
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[10px] font-bold">
                    {format(new Date(entry.createdAt), 'dd MMM yyyy · HH:mm')}
                  </span>
                </div>
                <p className="mt-3 font-serif-display text-2xl leading-tight">“{entry.body}”</p>
                {entry.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.imageUrl}
                    alt=""
                    className="mt-3 max-h-64 w-full border-[3px] border-black object-cover"
                  />
                )}
                {entry.contentHash && (
                  <p className="mt-2 break-all font-mono text-[9px] font-bold text-black/55">
                    commitment {entry.contentHash}
                  </p>
                )}
                <p className="mt-3 font-mono text-[10px] font-bold uppercase">
                  — {entry.author}, Keeper
                </p>
              </article>
            </li>
          );
        })}
      </ol>

      <p className="mt-8 border-[3px] border-black bg-black p-4 text-xs font-bold leading-relaxed text-[#fff8e7]">
        Each mark gets a content hash chained into the Cell&rsquo;s artifact_root. Full text and
        images live in the Living Artifact; the Cell carries the proof.
      </p>
    </PageShell>
  );
}
