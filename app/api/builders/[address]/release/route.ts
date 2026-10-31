import { releaseBuilderName } from '@/lib/server/builders-store';
import { requireSession } from '@/lib/server/auth';
import { respond } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

/** After a player gives their username back on chain, the profile forgets it too. Only they can ask. */
export async function POST(request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return respond(async () => {
    requireSession(request, decodeURIComponent(address));
    return releaseBuilderName(decodeURIComponent(address));
  });
}
