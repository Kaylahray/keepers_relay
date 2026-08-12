import { getCommunityBySlug } from '@/lib/server/store';
import { respond } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const address = new URL(request.url).searchParams.get('address');
  return respond(() => getCommunityBySlug(slug, address));
}
