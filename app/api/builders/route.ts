import { getBuilder, listBuilders, upsertBuilder } from '@/lib/server/social-service';
import { readBody, respond, respondSocial } from '@/lib/server/respond';
import { requireSession } from '@/lib/server/auth';
import type { CharacterId } from '@/lib/characters';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address')?.trim();
  if (address) {
    return respond(async () => {
      const builder = await getBuilder(address);
      return builder ? { builder } : { builder: null };
    });
  }
  return respond(() => listBuilders());
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

  const session = requireSession(request, body.address);

  return respondSocial(() =>
    upsertBuilder({
      address: session.address,
      username: body.username ?? '',
      displayName: body.displayName ?? '',
      characterId: body.characterId ?? null,
      headline: body.headline,
      avatarSporeId: body.avatarSporeId,
    }),
  );
}
