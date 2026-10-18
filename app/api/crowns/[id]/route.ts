import { deleteCrown, joinCrown, readPublicCrown } from '@/lib/server/crowns-store';
import { roomToStored } from '@/lib/crown/rooms';
import { ApiError } from '@/lib/server/errors';
import { requireSession } from '@/lib/server/auth';
import { readBody, respond } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return respond(async () => {
    const result = await readPublicCrown(id);
    if (!result) throw new ApiError('Crown not found.', 404);
    // The lobby's clock. Every screen counts down against this, not its own device time.
    return { room: roomToStored(result.room), seats: result.seats, now: Date.now() };
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const body = await readBody<{
    displayName?: string;
    bidOutPoint?: { txHash: string; index: string } | null;
    clearBid?: boolean;
  }>(request);
  return respond(async () => {
    const session = requireSession(request);
    const { id } = await params;
    const result = await joinCrown(id, {
      address: session.address,
      displayName: body.displayName?.trim() || session.address.slice(0, 10),
      bidOutPoint: body.bidOutPoint,
      clearBid: body.clearBid,
    });
    return { room: roomToStored(result.room), seats: result.seats };
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const session = requireSession(request);
    const { id } = await params;
    await deleteCrown(id, session.address);
    return { deleted: true };
  });
}
