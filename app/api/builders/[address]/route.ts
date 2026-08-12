import { getBuilder, touchBuilder } from '@/lib/server/store';
import { respond, respondWrite } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  return respond(() => {
    const builder = getBuilder(decodeURIComponent(address));
    if (!builder) {
      return { builder: null };
    }
    return { builder };
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  return respondWrite(() => touchBuilder(decodeURIComponent(address)));
}
