import { endorseCandidate } from '@/lib/server/store';
import { respond, respondWrite } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await params;
  return respondWrite(() => endorseCandidate(entryId));
}
