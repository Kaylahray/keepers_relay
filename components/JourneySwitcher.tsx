'use client';

import Link from 'next/link';
import { Coins, Plus, Rocket } from 'lucide-react';
import { resolveCover } from '@/lib/poster';
import { useFundJourney, useJourneysQuery } from '@/hooks/useChain';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useWallet } from '@/hooks/useWallet';
import { useState } from 'react';

/** Switch between live Cell streaks + top up the soft reward pot. */
export function JourneySwitcher({ activeId }: { activeId: string }) {
  const journeys = useJourneysQuery();
  const fund = useFundJourney();
  const { address, isConnected } = useWallet();
  const myBuilder = useMyBuilder();
  const [fundAmount, setFundAmount] = useState(10);

  const list = journeys.data?.journeys ?? [];
  const active = list.find((j) => j.id === activeId) ?? list[0];
  const me = myBuilder.data?.builder;

  return (
    <section className="rounded-2xl border border-white/15 bg-[#15121d] p-4 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
            Cell streaks
          </p>
          <p className="mt-1 text-sm font-medium text-white/70">Streaks in this room.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/communities"
            className="rounded border border-white/20 px-3 py-2 text-[10px] font-bold uppercase text-white/80 hover:bg-white/5"
          >
            Communities
          </Link>
          <Link
            href="/launch"
            className="arena-cta inline-flex items-center gap-1.5 rounded px-3 py-2 text-[10px] font-bold uppercase"
          >
            <Plus className="h-3.5 w-3.5" />
            Launch
          </Link>
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {list.map((journey) => {
          const selected = journey.id === activeId;
          return (
            <Link
              key={journey.id}
              href={`/streaks/${journey.id}`}
              className={`min-w-[9.5rem] shrink-0 overflow-hidden rounded-xl border text-left ${
                selected
                  ? 'border-[#ff56f6]/50 bg-[#ff56f6]/15'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveCover(journey.coverImageUrl, journey.creatureName)}
                alt=""
                className="h-20 w-full bg-black/40 object-contain"
              />
              <p className="truncate px-2.5 pt-2 text-xs font-bold uppercase text-white">
                {journey.creatureName}
              </p>
              <p className="mt-1 px-2.5 font-mono text-[9px] font-bold text-white/45">
                #{journey.holderCount} · {journey.status}
              </p>
              <p className="mt-1 flex items-center gap-1 px-2.5 pb-2.5 font-mono text-[9px] font-bold text-[#e1bf47]">
                <Coins className="h-3 w-3" />
                {journey.rewardPoolCkb} CKB
              </p>
            </Link>
          );
        })}
      </div>

      {active && isConnected && me?.onboarded && active.status !== 'dead' && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-white/10 pt-3">
          <label className="text-[10px] font-bold uppercase tracking-wider text-white/45">
            Add to pot
            <input
              type="number"
              min={1}
              max={me.pointsBalance}
              value={fundAmount}
              onChange={(e) => setFundAmount(Number(e.target.value))}
              className="mt-1 block w-24 rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 font-mono text-xs font-bold text-white"
            />
          </label>
          <button
            type="button"
            disabled={fund.isPending || fundAmount < 1}
            onClick={() =>
              address &&
              fund.mutate({
                journeyId: active.id,
                address,
                amount: fundAmount,
              })
            }
            className="arena-cta rounded px-3 py-2 text-[10px] font-bold uppercase disabled:opacity-40"
          >
            <Rocket className="mr-1 inline h-3 w-3" />
            Fund ({me.pointsBalance} pts)
          </button>
          {fund.error && (
            <p className="w-full text-xs font-bold text-[#ff56f6]">{fund.error.message}</p>
          )}
        </div>
      )}
    </section>
  );
}
