'use client';

import { formatDistanceToNow } from 'date-fns';
import { Globe2, Home, MapPin, Sparkles } from 'lucide-react';
import type { Chain } from '@/types/chain';
import {
  CREATURE_STAGE_LABEL,
  creatureStageForHolders,
} from '@/types/chain';
import type { LivingArtifact } from '@/types/keeper';
import { resolveCover } from '@/lib/poster';

export function JourneyCard({
  chain,
  artifact,
}: {
  chain: Chain;
  artifact: LivingArtifact | null;
}) {
  const startedAt = chain.owners[0]?.receivedAt;
  const ageLabel = startedAt
    ? formatDistanceToNow(new Date(startedAt), { addSuffix: false })
    : '—';
  const cities = Array.from(
    new Set(
      [
        ...chain.owners.map((o) => o.city).filter(Boolean),
        ...(artifact?.entries.map((e) => e.place).filter(Boolean) ?? []),
      ] as string[],
    ),
  );
  const stage = creatureStageForHolders(chain.owners.length);
  const returned = chain.status === 'returned';

  const cover = resolveCover(chain.coverImageUrl, chain.creatureName);

  return (
    <section className="neo-card overflow-hidden bg-[#fff8e7] p-0 text-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cover} alt="" className="h-36 w-full object-cover" />
      <div className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em]">Living journey</p>
          <h2 className="mt-1 font-poster text-3xl uppercase leading-none">
            {chain.creatureName}
          </h2>
          <p className="mt-2 max-w-md text-sm font-semibold leading-relaxed">{chain.seedPrompt}</p>
        </div>
        <div className="border-[3px] border-black bg-[#d6ff00] px-3 py-2 text-center">
          <Sparkles className="mx-auto h-4 w-4 stroke-[3]" />
          <p className="mt-1 font-poster text-lg uppercase leading-none">
            {CREATURE_STAGE_LABEL[stage]}
          </p>
          <p className="mt-1 font-mono text-[9px] font-bold">STAGE · {stage.toUpperCase()}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="Age" value={ageLabel} />
        <MiniStat label="Holders" value={String(chain.owners.length)} />
        <MiniStat label="Places" value={String(cities.length)} />
        <MiniStat label="PROOF pot" value={String(chain.rewardPoolProof)} />
      </div>

      {chain.genesisTxHash && (
        <a
          href={`https://pudge.explorer.nervos.org/transaction/${chain.lastTxHash ?? chain.genesisTxHash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-[10px] font-black uppercase underline"
        >
          View Chain Cell tx
        </a>
      )}

      {chain.mode === 'return_home' && (
        <p className="mt-3 flex items-start gap-2 border-2 border-black bg-[#ffe454] p-2.5 text-xs font-semibold">
          <Home className="mt-0.5 h-4 w-4 shrink-0 stroke-[3]" />
          {returned
            ? `${chain.creatureName} made it home to ${chain.creatorName}. Journey sealed.`
            : `Bring ${chain.creatureName} home to ${chain.creatorName}. No repeat holders — only new people, then the creator.`}
        </p>
      )}

      {cities.length > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
            <Globe2 className="h-3.5 w-3.5 stroke-[3]" /> Path so far
          </p>
          <p className="mt-2 font-mono text-xs font-bold leading-relaxed">
            {cities.join(' → ')}
          </p>
        </div>
      )}

      {artifact && artifact.entries.length > 0 && (
        <div className="mt-4 border-t-[3px] border-black pt-4">
          <p className="text-[10px] font-black uppercase tracking-wider">Contribution trail</p>
          <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
            {[...artifact.entries].reverse().slice(0, 6).map((entry) => (
              <li key={entry.id} className="border-2 border-black bg-white p-2.5">
                {entry.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.imageUrl}
                    alt=""
                    className="mb-2 max-h-28 w-full border border-black object-cover"
                  />
                )}
                <p className="text-xs font-semibold leading-snug">“{entry.body}”</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[9px] font-bold text-black/60">
                  <span>@{entry.author}</span>
                  {entry.place && (
                    <span className="inline-flex items-center gap-0.5">
                      <MapPin className="h-3 w-3 stroke-[3]" />
                      {entry.place}
                    </span>
                  )}
                  <span className="uppercase">{entry.kind}</span>
                  {entry.contentHash && (
                    <span title={entry.contentHash}>hash {entry.contentHash.slice(0, 10)}…</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-black bg-white p-2">
      <p className="font-poster text-xl uppercase leading-none">{value}</p>
      <p className="mt-1 text-[9px] font-black uppercase tracking-wider">{label}</p>
    </div>
  );
}
