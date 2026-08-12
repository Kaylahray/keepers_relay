import { listBuilders, upsertBuilder } from '@/lib/server/store';
import { readBody, respond, respondWrite } from '@/lib/server/respond';
import type { CharacterId } from '@/lib/characters';

export const dynamic = 'force-dynamic';

export function GET() {
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

  return respondWrite(() =>
    upsertBuilder({
      address: body.address ?? '',
      username: body.username ?? '',
      displayName: body.displayName ?? '',
      characterId: body.characterId ?? null,
      headline: body.headline,
      avatarSporeId: body.avatarSporeId,
    }),
  );
}
