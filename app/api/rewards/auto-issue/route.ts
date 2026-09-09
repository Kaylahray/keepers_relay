import { NextResponse } from 'next/server';
import { serverAutoIssueRewardTickets } from '@/lib/rewards/auto-issue-server';
import {
  REWARD_MILESTONES,
  type RewardMilestone,
} from '@/lib/rewards/milestones';

export const dynamic = 'force-dynamic';

function isRewardMilestone(v: unknown): v is RewardMilestone {
  return typeof v === 'string' && REWARD_MILESTONES.includes(v as RewardMilestone);
}

export async function POST(request: Request) {
  try {
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
        { error: 'recipientCkbAddress is required.' },
        { status: 400 },
      );
    }

    const raw = body.milestones;
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json(
        { error: 'milestones must be a non-empty array.' },
        { status: 400 },
      );
    }

    const milestones = raw.filter(isRewardMilestone);
    if (milestones.length === 0) {
      return NextResponse.json(
        { error: 'No valid milestone ids in milestones.' },
        { status: 400 },
      );
    }

    const result = await serverAutoIssueRewardTickets({
      recipientCkbAddress,
      requestedMilestones: milestones,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
