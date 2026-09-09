'use client';

import { rewardClaimsConfigured } from '@/lib/registry/config';
import type { RewardMilestone } from '@/lib/rewards/milestones';

export type AutoIssueApiResult = {
  issued: RewardMilestone[];
  skipped: string[];
  txHashes: string[];
};

/** Server mints claim Cells after milestones (issuer key on server). */
export async function postRewardAutoIssue(params: {
  recipientCkbAddress: string;
  milestones: RewardMilestone[];
}): Promise<AutoIssueApiResult | null> {
  if (!rewardClaimsConfigured()) return null;
  if (params.milestones.length === 0) return null;

  const res = await fetch('/api/rewards/auto-issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipientCkbAddress: params.recipientCkbAddress,
      milestones: params.milestones,
    }),
  });

  const data = (await res.json()) as AutoIssueApiResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Auto-issue failed (${res.status})`);
  }
  return {
    issued: data.issued ?? [],
    skipped: data.skipped ?? [],
    txHashes: data.txHashes ?? [],
  };
}
