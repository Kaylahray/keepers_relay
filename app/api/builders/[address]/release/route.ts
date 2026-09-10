import { releaseBuilderHandle } from '@/lib/server/social-service';
import { respondSocial } from '@/lib/server/respond';
import { requireSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const decoded = decodeURIComponent(address);
  requireSession(request, decoded);
  return respondSocial(() => releaseBuilderHandle(decoded));
}
