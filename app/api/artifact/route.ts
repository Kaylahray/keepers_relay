import { getArtifact, publishArtifact } from '@/lib/server/store';
import { readBody, respond, respondWrite } from '@/lib/server/respond';
import type { ArtifactKind } from '@/types/keeper';

export const dynamic = 'force-dynamic';

export function GET() {
  return respond(() => getArtifact());
}

export async function POST(request: Request) {
  const body = await readBody<{ body: string; kind: ArtifactKind; place?: string }>(request);
  return respondWrite(() =>
    publishArtifact({
      body: body.body ?? '',
      kind: body.kind ?? 'message',
      place: body.place,
    }),
  );
}
