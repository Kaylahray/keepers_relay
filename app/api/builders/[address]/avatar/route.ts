import { setBuilderAvatar } from '@/lib/server/builders-store';
import { requireSession } from '@/lib/server/auth';
import { readBody, respond } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const body = await readBody<{ avatarSporeId?: string | null; clearIf?: string }>(request);
  return respond(async () => {
    requireSession(request, decodeURIComponent(address));
    if (body.clearIf) {
      const { getBuilder } = await import('@/lib/server/builders-store');
      const current = await getBuilder(address);
      if (current?.avatarSporeId !== body.clearIf) return current;
      return setBuilderAvatar(address, null);
    }
    return setBuilderAvatar(address, body.avatarSporeId ?? null);
  });
}
