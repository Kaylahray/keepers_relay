import { playerStats } from '@/lib/server/crown-history';
import { respond } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

/** Public: wins, crowns taken and the crowns a player is in, read from the crowns and steals tables. */
export async function GET(_request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return respond(() => playerStats(decodeURIComponent(address)));
}
