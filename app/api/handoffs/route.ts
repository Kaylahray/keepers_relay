import {
  acceptHandoff,
  declineHandoff,
  listHandoffRequests,
  requestHandoff,
} from '@/lib/server/store';
import { readBody, respond, respondWrite } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const journeyId = new URL(request.url).searchParams.get('journeyId') ?? '';
  return respond(() => listHandoffRequests(journeyId));
}

export async function POST(request: Request) {
  const body = await readBody<{
    action?: 'request' | 'accept' | 'decline';
    address?: string;
    journeyId?: string;
    requestId?: string;
    note?: string;
    city?: string;
    cellOutPoint?: { txHash: string; index: string };
    txHash?: string;
    expiresAt?: string;
  }>(request);

  const action = body.action ?? 'request';
  const address = body.address ?? '';

  if (action === 'accept') {
    return respondWrite(() =>
      acceptHandoff({
        address,
        requestId: body.requestId ?? '',
        city: body.city,
        cellOutPoint: body.cellOutPoint,
        txHash: body.txHash,
        expiresAt: body.expiresAt,
      }),
    );
  }

  if (action === 'decline') {
    return respondWrite(() =>
      declineHandoff({
        address,
        requestId: body.requestId ?? '',
      }),
    );
  }

  return respondWrite(() =>
    requestHandoff({
      address,
      journeyId: body.journeyId ?? '',
      note: body.note,
    }),
  );
}
