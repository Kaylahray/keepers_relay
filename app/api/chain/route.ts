import { getChain } from '@/lib/server/store';
import { respond } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export function GET() {
  return respond(() => getChain());
}
