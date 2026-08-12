import { getRelayDetail } from '@/lib/server/store';
import { respond } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ relayId: string }> },
) {
  const { relayId } = await params;
  return respond(() => getRelayDetail(relayId));
}
