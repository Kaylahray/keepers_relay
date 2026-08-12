import { submitRelayProof } from '@/lib/server/store';
import { readBody, respond, respondWrite } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ relayId: string }> },
) {
  const { relayId } = await params;
  const body = await readBody<{ proof: string }>(request);
  return respondWrite(() => submitRelayProof(relayId, body.proof ?? ''));
}
