import { assumeKeeper } from '@/lib/server/store';
import { readBody, respond, respondWrite } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

/** Demo: connected builder takes the live Cell so they can act as Keeper. */
export async function POST(request: Request) {
  const body = await readBody<{ address: string }>(request);
  return respondWrite(() => assumeKeeper(body.address ?? ''));
}
