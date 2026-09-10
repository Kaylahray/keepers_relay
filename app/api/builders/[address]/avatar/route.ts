import {
  setBuilderAvatar,
  clearBuilderAvatarIfMatches,
} from '@/lib/server/social-service';
import { readBody, respondSocial } from '@/lib/server/respond';
import { requireSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const decoded = decodeURIComponent(address);
  requireSession(request, decoded);
  const body = await readBody<{ avatarSporeId: string | null; clearIf?: string }>(request);
  return respondSocial(() => {
    if (body.clearIf) {
      return clearBuilderAvatarIfMatches(decoded, body.clearIf);
    }
    return setBuilderAvatar(decoded, body.avatarSporeId ?? null);
  });
}
