import { unlockBadge } from '@/lib/server/social-service';
import { readBody, respondWrite } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await readBody<{ address?: string; badgeId?: string }>(request);
  return respondWrite(() => unlockBadge(body.address ?? '', body.badgeId ?? ''));
}
