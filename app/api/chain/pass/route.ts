import type { Chain } from '@/types/chain';
import type { LivingArtifact } from '@/types/keeper';
import { passChain } from '@/lib/server/store';
import { readBody, respond, respondWrite } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await readBody<{
    recipient: string;
    city?: string;
    journeyId?: string;
    chainSnapshot?: Chain;
    artifactSnapshot?: LivingArtifact | null;
    recipientAddress?: string;
    cellOutPoint?: { txHash: string; index: string };
    txHash?: string;
    expiresAt?: string;
    artifactRoot?: string;
    artifactRootOnChain?: boolean;
  }>(request);
  return respondWrite(() =>
    passChain(body.recipient ?? '', body.city, {
      journeyId: body.journeyId,
      chainSnapshot: body.chainSnapshot,
      artifactSnapshot: body.artifactSnapshot,
      recipientAddress: body.recipientAddress,
      cellOutPoint: body.cellOutPoint,
      txHash: body.txHash,
      expiresAt: body.expiresAt,
      artifactRoot: body.artifactRoot,
      artifactRootOnChain: body.artifactRootOnChain,
    }),
  );
}
