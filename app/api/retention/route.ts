import {
  getDraftMark,
  nominateNextKeeper,
  rescueChain,
  saveDraftMark,
} from '@/lib/server/store';
import { readBody, respond, respondWrite } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get('address') ?? '';
  const journeyId = url.searchParams.get('journeyId') ?? '';
  return respond(() => getDraftMark(address, journeyId));
}

export async function POST(request: Request) {
  const body = await readBody<{
    action?: 'save' | 'nominate' | 'rescue';
    address?: string;
    journeyId?: string;
    nomineeAddress?: string;
    body?: string;
    kind?: 'message' | 'meme' | 'rule' | 'view' | 'stamp';
    place?: string;
    imageUrl?: string;
  }>(request);

  if (body.action === 'nominate') {
    return respondWrite(() =>
      nominateNextKeeper({
        address: body.address ?? '',
        journeyId: body.journeyId ?? '',
        nomineeAddress: body.nomineeAddress ?? '',
      }),
    );
  }

  if (body.action === 'rescue') {
    return respondWrite(() =>
      rescueChain({
        address: body.address ?? '',
        journeyId: body.journeyId ?? '',
      }),
    );
  }

  return respondWrite(() =>
    saveDraftMark({
      address: body.address ?? '',
      journeyId: body.journeyId ?? '',
      body: body.body,
      kind: body.kind,
      place: body.place,
      imageUrl: body.imageUrl,
    }),
  );
}
