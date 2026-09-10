import { NextResponse } from 'next/server';
import { serverAutoIssueRewardTickets } from '@/lib/rewards/auto-issue-server';
import {
  REWARD_MILESTONES,
  type RewardMilestone,
} from '@/lib/rewards/milestones';
import { requireSession } from '@/lib/server/auth';
import { ApiError } from '@/lib/server/errors';
import { RATE, rateLimitOrThrow } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

function isRewardMilestone(v: unknown): v is RewardMilestone {
  return typeof v === 'string' && REWARD_MILESTONES.includes(v as RewardMilestone);
}

export async function POST(request: Request) {
  try {
    rateLimitOrThrow(
      request,
      'rewards:auto-issue',
      RATE.autoIssue.limit,
      RATE.autoIssue.windowMs,
    );

    if (!process.env.REWARD_AUTO_ISSUER_PRIVATE_KEY?.trim()) {
      throw new ApiError('Reward issuer is not configured.', 503);
    }

    const body = (await request.json()) as {
      recipientCkbAddress?: string;
      milestones?: unknown;
    };

    const recipientCkbAddress =
      typeof body.recipientCkbAddress === 'string'
        ? body.recipientCkbAddress.trim()
        : '';
    if (!recipientCkbAddress) {
      return NextResponse.json(
        { message: 'recipientCkbAddress is required.' },
        { status: 400 },
      );
    }

    requireSession(request, recipientCkbAddress);

    const raw = body.milestones;
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json(
        { message: 'milestones must be a non-empty array.' },
        { status: 400 },
      );
    }

    const milestones = raw.filter(isRewardMilestone);
    if (milestones.length === 0) {
      return NextResponse.json(
        { message: 'No valid milestone ids in milestones.' },
        { status: 400 },
      );
    }

    // Restrict freebie milestones until eligibility is fully server-side.
    const allowed = milestones.filter(
      (m) => m === 'username_claimed' || m === 'profile_completed',
    );
    if (allowed.length === 0) {
      return NextResponse.json(
        { message: 'No eligible milestones for auto-issue.' },
        { status: 400 },
      );
    }

    const result = await serverAutoIssueRewardTickets({
      recipientCkbAddress,
      requestedMilestones: allowed,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ message: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Server error.';
    return NextResponse.json({ message }, { status: 500 });
  }
}
