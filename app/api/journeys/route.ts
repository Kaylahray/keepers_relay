import {
  fundJourneyTreasury,
  launchJourney,
  listJourneys,
  selectJourney,
} from '@/lib/server/store';
import { readBody, respond, respondWrite } from '@/lib/server/respond';
import type { ChainMode } from '@/types/chain';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const communityId = new URL(request.url).searchParams.get('communityId') ?? undefined;
  return respond(() => listJourneys(communityId || undefined));
}

export async function POST(request: Request) {
  const body = await readBody<{
    action?: 'launch' | 'select' | 'fund';
    address?: string;
    communityId?: string;
    journeyId?: string;
    creatureName?: string;
    seedPrompt?: string;
    mode?: ChainMode;
    trophyGoal?: number;
    windowHours?: number;
    initialProof?: number;
    rewardPoolNote?: string;
    coverImageUrl?: string;
    amount?: number;
    note?: string;
    cellOutPoint?: { txHash: string; index: string };
    onChainChainId?: string;
    genesisTxHash?: string;
    expiresAt?: string;
  }>(request);

  const action = body.action ?? 'launch';

  if (action === 'select') {
    return respondWrite(() => selectJourney(body.journeyId ?? ''));
  }

  if (action === 'fund') {
    return respondWrite(() =>
      fundJourneyTreasury({
        journeyId: body.journeyId ?? '',
        address: body.address ?? '',
        amount: body.amount ?? 0,
        note: body.note,
      }),
    );
  }

  return respondWrite(() =>
    launchJourney({
      address: body.address ?? '',
      communityId: body.communityId ?? '',
      creatureName: body.creatureName ?? '',
      seedPrompt: body.seedPrompt ?? '',
      mode: body.mode === 'open' ? 'open' : 'return_home',
      trophyGoal: body.trophyGoal ?? 50,
      windowHours: body.windowHours,
      initialProof: body.initialProof,
      rewardPoolNote: body.rewardPoolNote,
      coverImageUrl: body.coverImageUrl,
      cellOutPoint: body.cellOutPoint,
      onChainChainId: body.onChainChainId,
      genesisTxHash: body.genesisTxHash,
      expiresAt: body.expiresAt,
    }),
  );
}
