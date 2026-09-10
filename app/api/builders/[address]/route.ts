import { getBuilder, touchBuilder } from '@/lib/server/social-service';
import { respond, respondSocial } from '@/lib/server/respond';
import { requireSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  return respond(async () => {
    const builder = await getBuilder(decodeURIComponent(address));
    if (!builder) {
      return { builder: null };
    }
    return { builder };
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const decoded = decodeURIComponent(address);
  requireSession(request, decoded);
  return respondSocial(() => touchBuilder(decoded));
}
