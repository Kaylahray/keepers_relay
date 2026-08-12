import { passChain } from '@/lib/server/store';
import { readBody, respond, respondWrite } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await readBody<{
    recipient: string;
    city?: string;
    recipientAddress?: string;
    cellOutPoint?: { txHash: string; index: string };
    txHash?: string;
    expiresAt?: string;
  }>(request);
  return respondWrite(() =>
    passChain(body.recipient ?? '', body.city, {
      recipientAddress: body.recipientAddress,
      cellOutPoint: body.cellOutPoint,
      txHash: body.txHash,
      expiresAt: body.expiresAt,
    }),
  );
}
