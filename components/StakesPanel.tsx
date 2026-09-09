'use client';

import { Flame, Skull, Trophy } from 'lucide-react';
import {
  stakesEntryAtHop,
  stakesPayoutShares,
  stakesWindowHoursAtHop,
  type Chain,
} from '@/types/chain';

/**
 * Stakes streaks: every Keeper buys a seat, the pot grows, the window shrinks.
 * Pass in time and you keep your seat; hold it when the clock dies and your
 * stake stays behind for everyone who did pass.
 */
export function StakesPanel({
  chain,
  address,
}: {
  chain: Chain;
  address?: string | null;
}) {
  const stakes = chain.stakes;
  if (!stakes) return null;

  const entries = chain.stakeEntries ?? [];
  const nextHop = chain.owners.length;
  const nextCost = stakesEntryAtHop(stakes, nextHop);
  const nextWindow = stakesWindowHoursAtHop(stakes, chain.windowHours, nextHop);
  const survivors = entries.filter((entry) => entry.survived && entry.address);
  const projected = stakesPayoutShares(chain.rewardPoolCkb, survivors);
  const settled = chain.status !== 'alive';

  const mySeat = address
    ? entries.find((entry) => entry.address.toLowerCase() === address.toLowerCase())
    : undefined;
  const myShare = address
    ? projected.find((share) => share.address.toLowerCase() === address.toLowerCase())
    : undefined;
  const holdingSeat = entries.find((entry) => entry.hop === chain.owners.length - 1);
  const iAmHolding = Boolean(
    mySeat && holdingSeat && mySeat.hop === holdingSeat.hop && chain.status === 'alive',
  );

  return (
    <div className="pot-pulse rounded-2xl border border-[#ff56f6]/40 bg-gradient-to-br from-[#af2a3a]/40 to-[#15121d] p-5 text-white">
      <div className="flex items-baseline justify-between border-b border-[#ff56f6]/40 pb-3">
        <h3 className="flex items-center gap-2 font-poster text-2xl uppercase leading-none">
          <Flame className="h-5 w-5 text-[#ff56f6]" />
          Blitz pot
        </h3>
        <span className="font-mono text-[10px] font-bold text-[#ff56f6]">
          {chain.rewardPoolCkb} CKB IN PLAY
        </span>
      </div>

      <p className="mt-3 text-sm font-medium leading-relaxed text-white/75">
        Pass before your window closes and you keep your seat. Later survivors take more. Hold when
        the clock dies and your stake stays behind.
      </p>

      {chain.status === 'alive' && (
        <div className="mt-4 grid grid-cols-2 gap-3 font-mono text-[11px] font-bold">
          <div className="rounded-xl border border-white/15 bg-black/30 p-3">
            <p className="text-[9px] uppercase tracking-wider text-white/50">Next seat</p>
            <p className="mt-1 text-lg text-[#ff56f6]">{nextCost} CKB</p>
          </div>
          <div className="rounded-xl border border-white/15 bg-black/30 p-3">
            <p className="text-[9px] uppercase tracking-wider text-white/50">Their clock</p>
            <p className="mt-1 text-lg text-[#e1bf47]">{nextWindow}h</p>
          </div>
        </div>
      )}

      {iAmHolding && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-[#ff56f6]/50 bg-[#ff56f6]/15 p-3 text-xs font-medium">
          <Skull className="mt-0.5 h-4 w-4 shrink-0" />
          You are holding {mySeat?.paid ?? 0} CKB of stake. Pass or forfeit.
        </p>
      )}

      {myShare && !iAmHolding && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-[#49b649]/40 bg-[#49b649]/10 p-3 text-xs font-medium">
          <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-[#49b649]" />
          {settled ? 'You took' : 'Your share right now is'} {myShare.amount} CKB.
        </p>
      )}

      <div className="mt-4">
        <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-white/50">
          {settled ? 'Final split' : 'If it died right now'}
        </p>
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
          {projected.length === 0 ? (
            <li className="font-mono text-[11px] text-white/45">
              Nobody has passed yet — the pot has no survivors.
            </li>
          ) : (
            [...projected].reverse().map((share) => (
              <li
                key={`${share.address}-${share.name}`}
                className="flex items-center justify-between border-b border-white/10 pb-1 font-mono text-[11px] last:border-0"
              >
                <span className="truncate">{share.name}</span>
                <span className="font-bold text-[#49b649]">+{share.amount}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
