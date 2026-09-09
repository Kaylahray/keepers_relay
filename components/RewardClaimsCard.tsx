'use client';

import { useRewardClaims } from '@/hooks/useRewardClaims';
import { describeRewardClaim } from '@/lib/rewards/onchain-claims';

export function RewardClaimsCard() {
  const rewards = useRewardClaims();

  if (!rewards.isConfigured) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
          On-chain rewards
        </p>
        <p className="mt-2 text-sm font-medium text-white/65">
          Treasury env not wired yet. In-app points still count. Set{' '}
          <code className="font-mono text-xs text-[#e1bf47]">NEXT_PUBLIC_SUDT_*</code> and{' '}
          <code className="font-mono text-xs text-[#e1bf47]">NEXT_PUBLIC_REWARD_*</code> in{' '}
          <code className="font-mono text-xs">.env.local</code> after deploy.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
        Claim tickets
      </p>
      <p className="mt-1 text-sm font-medium text-white/65">
        Milestones mint claim Cells. Redeem each for sUDT from the treasury lock.
      </p>

      {rewards.isLoading ? (
        <p className="mt-3 text-sm font-bold text-white/45">Loading claims…</p>
      ) : rewards.claims.length === 0 ? (
        <p className="mt-3 text-sm font-bold text-white/45">
          No open claim tickets. Earn milestones (username, profile, relays) to get one.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rewards.claims.map((claim) => (
            <li
              key={`${claim.eventIdHash}-${claim.nonce}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
            >
              <span className="text-sm font-bold uppercase text-white">
                {describeRewardClaim(claim)}
              </span>
              <button
                type="button"
                disabled={rewards.isClaiming}
                onClick={() => void rewards.claimReward(claim)}
                className="arena-cta rounded px-3 py-1.5 text-[11px] font-bold uppercase disabled:opacity-50"
              >
                Claim reward
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
