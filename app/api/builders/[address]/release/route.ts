import { releaseBuilderHandle } from '@/lib/server/store';
import { respondWrite } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  return respondWrite(() => releaseBuilderHandle(decodeURIComponent(address)));
}
