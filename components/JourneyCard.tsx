'use client';

import { formatDistanceToNow } from 'date-fns';
import { Globe2, Home, MapPin, Sparkles, Skull } from 'lucide-react';
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
  const startedAt = chain.owners[0]?.receivedAt ?? chain.createdAt;
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
  const dead = chain.status === 'dead';
  const finalHolder = chain.owners[chain.owners.length - 1]?.name ?? '—';
  const cover = resolveCover(chain.coverImageUrl, chain.creatureName);

  return (
    <section
      className={`overflow-hidden rounded-2xl border border-white/15 bg-[#15121d] text-white ${
        dead ? 'opacity-80' : ''
      }`}
    >
      <div className="relative h-44 w-full bg-[#0c0a14]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover}
          alt=""
          className={`h-full w-full object-contain object-center ${dead ? 'grayscale' : ''}`}
        />
      </div>
      <div className="p-5">
        {dead ? (
          <div className="mb-4 rounded-xl border border-white/15 bg-white/5 p-3">
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/60">
              <Skull className="h-3.5 w-3.5" /> Memorial
            </p>
            <p className="mt-2 text-sm font-medium leading-relaxed text-white/80">
              {chain.creatureName} lived {ageLabel}, carried by {chain.owners.length} Keepers.
              Final holder: {finalHolder}. Cause: the clock ran out. This Cell stays locked —
              the lineage is the trophy.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
              {dead ? 'Dead Cell' : returned ? 'Returned home' : 'Living object'}
            </p>
            <h2 className="mt-1 font-poster text-3xl uppercase leading-none text-white">
              {chain.creatureName}
            </h2>
            <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-white/70">
              {chain.seedPrompt}
            </p>
            <p className="mt-2 font-mono text-[10px] font-bold uppercase text-white/45">
              Origin · {chain.creatorName}
              {chain.mode === 'return_home' ? ' · return-home' : ' · open'}
              {(chain.rescueCount ?? 0) > 0
                ? ` · rescued ${chain.rescueCount}×`
                : ''}
            </p>
          </div>
          <div
            className={`rounded-xl border px-3 py-2 text-center ${
              dead
                ? 'border-white/20 bg-white/10 text-white/70'
                : 'border-[#ff56f6]/40 bg-[#ff56f6]/15 text-white'
            }`}
          >
            <Sparkles className="mx-auto h-4 w-4" />
            <p className="mt-1 font-poster text-lg uppercase leading-none">
              {CREATURE_STAGE_LABEL[stage]}
            </p>
            <p className="mt-1 font-mono text-[9px] font-bold text-white/50">
              STAGE · {stage.toUpperCase()}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="Age" value={ageLabel} />
          <MiniStat label="Holders" value={String(chain.owners.length)} />
          <MiniStat label="Places" value={String(cities.length)} />
          <MiniStat label="CKB pot" value={String(chain.rewardPoolCkb)} />
        </div>

        {chain.genesisTxHash && (
          <a
            href={`https://pudge.explorer.nervos.org/transaction/${chain.lastTxHash ?? chain.genesisTxHash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-[10px] font-bold uppercase text-[#ff56f6] underline"
          >
            View Chain Cell tx
          </a>
        )}

        {chain.mode === 'return_home' && !dead && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-[#e1bf47]/40 bg-[#e1bf47]/10 p-2.5 text-xs font-medium text-white/85">
            <Home className="mt-0.5 h-4 w-4 shrink-0 text-[#e1bf47]" />
            {returned
              ? `${chain.creatureName} made it home to ${chain.creatorName}. Journey sealed.`
              : `Bring ${chain.creatureName} home to ${chain.creatorName}. No repeat holders — only new people, then the creator.`}
          </p>
        )}

        {cities.length > 0 && (
          <div className="mt-4">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/45">
              <Globe2 className="h-3.5 w-3.5" /> Path so far
            </p>
            <p className="mt-2 font-mono text-xs font-bold leading-relaxed text-white/80">
              {cities.join(' → ')}
            </p>
          </div>
        )}

        {artifact && artifact.entries.length > 0 && (
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">
              Contribution trail
            </p>
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
              {[...artifact.entries].reverse().slice(0, 6).map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-2.5"
                >
                  {entry.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.imageUrl}
                      alt=""
                      className="mb-2 max-h-28 w-full rounded-lg object-contain"
                    />
                  )}
                  <p className="text-xs font-medium leading-snug text-white/90">
                    “{entry.body}”
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[9px] font-bold text-white/45">
                    <span>@{entry.author}</span>
                    {entry.place && (
                      <span className="inline-flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" />
                        {entry.place}
                      </span>
                    )}
                    <span className="uppercase">{entry.kind}</span>
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
    <div className="rounded-xl border border-white/10 bg-white/5 p-2">
      <p className="font-poster text-xl uppercase leading-none text-white">{value}</p>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-white/45">
        {label}
      </p>
    </div>
  );
}
