import { getBuilder, listBuilderProfiles, upsertBuilder } from '@/lib/server/builders-store';
import { requireSession } from '@/lib/server/auth';
import { readBody, respond } from '@/lib/server/respond';
import type { CharacterId } from '@/lib/characters';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address')?.trim();
  return respond(async () => {
    if (!address) return listBuilderProfiles();
    const builder = await getBuilder(address);
    return { builder };
  });
}

export async function POST(request: Request) {
  const body = await readBody<{
    address: string;
    username: string;
    displayName: string;
    characterId?: CharacterId | null;
    headline?: string;
    avatarSporeId?: string | null;
  }>(request);
  return respond(async () => {
    const session = requireSession(request, body.address);
    return upsertBuilder({
      address: session.address,
      username: body.username ?? '',
      displayName: body.displayName ?? 'Player',
      characterId: body.characterId ?? null,
      headline: body.headline,
      avatarSporeId: body.avatarSporeId,
    });
  });
}
