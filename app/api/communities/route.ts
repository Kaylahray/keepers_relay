import {
  createCommunity,
  grantCommunityPoints,
  joinCommunity,
  leaveCommunity,
  listCommunities,
} from '@/lib/server/social-service';
import { readBody, respond, respondWrite } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address');
  return respond(() => listCommunities(address));
}

export async function POST(request: Request) {
  const body = await readBody<{
    action?: 'create' | 'join' | 'leave' | 'grant_points';
    address?: string;
    slug?: string;
    name?: string;
    blurb?: string;
    coverImageUrl?: string;
    recipientAddress?: string;
    amount?: number;
    note?: string;
    invitedByAddress?: string;
  }>(request);

  const action = body.action ?? 'create';
  const address = body.address ?? '';

  if (action === 'join') {
    return respondWrite(() =>
      joinCommunity(body.slug ?? '', address, body.invitedByAddress),
    );
  }
  if (action === 'leave') {
    return respondWrite(() => leaveCommunity(body.slug ?? '', address));
  }
  if (action === 'grant_points') {
    return respondWrite(() =>
      grantCommunityPoints({
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
