import { startRelay } from '@/lib/server/store';
import { respond, respondWrite } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ relayId: string }> },
) {
  const { relayId } = await params;
  return respondWrite(() => startRelay(relayId));
}
