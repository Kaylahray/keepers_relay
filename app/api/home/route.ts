import { getHomeFeed, markHomeNoticesRead } from '@/lib/server/store';
import { readBody, respond, respondWrite } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address') ?? '';
  return respond(() => getHomeFeed(address));
}

export async function POST(request: Request) {
  const body = await readBody<{
    action?: 'mark_read';
    address?: string;
  }>(request);
  const address = body.address ?? '';
  return respondWrite(() => markHomeNoticesRead(address));
}
