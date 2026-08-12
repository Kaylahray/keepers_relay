import { getQueue, joinQueue } from '@/lib/server/store';
import { readBody, respond, respondWrite } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export function GET() {
  return respond(() => getQueue());
}

export async function POST(request: Request) {
  const body = await readBody<{ name: string; pledge: string }>(request);
  return respondWrite(() => joinQueue({ name: body.name ?? '', pledge: body.pledge ?? '' }));
}
