import { resetChain } from '@/lib/server/store';
import { respond, respondWrite } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export function POST() {
  return respondWrite(() => resetChain());
}
