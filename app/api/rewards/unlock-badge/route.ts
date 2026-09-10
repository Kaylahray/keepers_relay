import { unlockBadge } from '@/lib/server/social-service';
import { readBody, respondSocial } from '@/lib/server/respond';
import { requireSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await readBody<{ address?: string; badgeId?: string }>(request);
  const session = requireSession(request, body.address);
  return respondSocial(() => unlockBadge(session.address, body.badgeId ?? ''));
}
