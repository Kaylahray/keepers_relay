import { proofForChoice } from '@/lib/server/crowns-store';
import { requireSession } from '@/lib/server/auth';
import { readBody, respond } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const body = await readBody<{ choice?: number }>(request);
  return respond(async () => {
    const session = requireSession(request);
    const { id } = await params;
    return proofForChoice(id, Number(body.choice), session.address);
  });
}
