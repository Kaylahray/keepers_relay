import { getPassport } from '@/lib/server/store';
import { respond } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address') ?? undefined;
  return respond(() => getPassport(address ?? undefined));
}
