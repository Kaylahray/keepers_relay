import { featureArtifact } from '@/lib/server/store';
import { readBody, respond, respondWrite } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await readBody<{ entryId: string }>(request);
  return respondWrite(() => featureArtifact(body.entryId ?? ''));
}
