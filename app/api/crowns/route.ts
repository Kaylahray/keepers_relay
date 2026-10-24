import { createCrown, listCrownVaults, publicRoom } from '@/lib/server/crowns-store';
import { syncCrown } from '@/lib/server/crowns-store';
import { roomFromStored, roomToStored, type StoredRoom } from '@/lib/crown/rooms';
import { normalizeAddress, requireSession } from '@/lib/server/auth';
import { readBody, respond } from '@/lib/server/respond';
import { requirePlayerName } from '@/lib/server/builders-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return respond(async () => {
    const rooms = await listCrownVaults();
    return rooms.map((room) => roomToStored(room));
  });
}

export async function POST(request: Request) {
  const body = await readBody<{ room?: StoredRoom }>(request);
  return respond(async () => {
    const session = requireSession(request);
    if (!body.room?.id) throw new Error('A crown id is required.');
    await requirePlayerName(session.address);
    const room = roomFromStored(body.room);
    room.hostAddress = normalizeAddress(session.address);
    await createCrown(room, session.address);
    return roomToStored(publicRoom(room));
  });
}

export async function PUT(request: Request) {
  const body = await readBody<{ room?: StoredRoom }>(request);
  return respond(async () => {
    const session = requireSession(request);
    if (!body.room?.id) throw new Error('A crown id is required.');
    return roomToStored(await syncCrown(roomFromStored(body.room), session.address));
  });
}
