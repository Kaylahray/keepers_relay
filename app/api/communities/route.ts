import {
  createCommunity,
  grantCommunityProof,
  joinCommunity,
  leaveCommunity,
  listCommunities,
} from '@/lib/server/store';
import { readBody, respond, respondWrite } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address');
  return respond(() => listCommunities(address));
}

export async function POST(request: Request) {
  const body = await readBody<{
    action?: 'create' | 'join' | 'leave' | 'grant_proof';
    address?: string;
    slug?: string;
    name?: string;
    blurb?: string;
    coverImageUrl?: string;
    recipientAddress?: string;
    amount?: number;
    note?: string;
  }>(request);

  const action = body.action ?? 'create';
  const address = body.address ?? '';

  if (action === 'join') {
    return respondWrite(() => joinCommunity(body.slug ?? '', address));
  }
  if (action === 'leave') {
    return respondWrite(() => leaveCommunity(body.slug ?? '', address));
  }
  if (action === 'grant_proof') {
    return respondWrite(() =>
      grantCommunityProof({
        adminAddress: address,
        slug: body.slug ?? '',
        recipientAddress: body.recipientAddress ?? '',
        amount: body.amount ?? 0,
        note: body.note,
      }),
    );
  }

  return respondWrite(() =>
    createCommunity({
      address,
      name: body.name ?? '',
      blurb: body.blurb ?? '',
      coverImageUrl: body.coverImageUrl,
    }),
  );
}
