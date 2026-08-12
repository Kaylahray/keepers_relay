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
    <section className="border-[3px] border-black bg-[#fff8e7] p-4 text-black">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em]">Cell streaks</p>
          <p className="mt-1 text-sm font-semibold">
            Streaks in this room.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/communities"
            className="neo-button inline-flex items-center gap-1.5 bg-[#224cff] px-3 py-2 text-[10px] font-black uppercase text-[#fff8e7]"
          >
            Communities
          </Link>
          <Link
            href="/launch"
            className="neo-button inline-flex items-center gap-1.5 bg-[#ff4cbd] px-3 py-2 text-[10px] font-black uppercase"
          >
            <Plus className="h-3.5 w-3.5 stroke-[3]" />
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
              className={`min-w-[9.5rem] shrink-0 overflow-hidden border-2 border-black text-left ${
                selected ? 'bg-[#d6ff00]' : 'bg-white'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveCover(journey.coverImageUrl, journey.creatureName)}
                alt=""
                className="h-16 w-full object-cover"
              />
              <p className="truncate px-2.5 pt-2 text-xs font-black uppercase">{journey.creatureName}</p>
              <p className="mt-1 px-2.5 font-mono text-[9px] font-bold text-black/60">
                #{journey.holderCount} · {journey.status}
              </p>
              <p className="mt-1 flex items-center gap-1 px-2.5 pb-2.5 font-mono text-[9px] font-bold">
                <Coins className="h-3 w-3 stroke-[3]" />
                {journey.rewardPoolProof} PROOF
              </p>
            </Link>
          );
        })}
      </div>

      {active && isConnected && me?.onboarded && active.status !== 'dead' && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t-2 border-black pt-3">
          <label className="text-[10px] font-black uppercase tracking-wider">
            Add to pot
            <input
              type="number"
              min={1}
              max={me.proofBalance}
              value={fundAmount}
              onChange={(e) => setFundAmount(Number(e.target.value))}
              className="mt-1 block w-24 border-2 border-black bg-white px-2 py-1.5 font-mono text-xs font-bold"
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
            className="neo-button bg-[#224cff] px-3 py-2 text-[10px] font-black uppercase text-[#fff8e7] disabled:opacity-40"
          >
            <Rocket className="mr-1 inline h-3 w-3 stroke-[3]" />
            Fund ({me.proofBalance} avail)
          </button>
          {fund.error && (
            <p className="w-full text-xs font-bold text-red-800">{fund.error.message}</p>
          )}
        </div>
      )}
    </section>
  );
}
