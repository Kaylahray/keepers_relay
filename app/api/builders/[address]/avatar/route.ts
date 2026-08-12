import { setBuilderAvatar, clearBuilderAvatarIfMatches } from '@/lib/server/store';
import { readBody, respond, respondWrite } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const body = await readBody<{ avatarSporeId: string | null; clearIf?: string }>(request);
  return respondWrite(() => {
    if (body.clearIf) {
      return clearBuilderAvatarIfMatches(decodeURIComponent(address), body.clearIf);
    }
    return setBuilderAvatar(decodeURIComponent(address), body.avatarSporeId ?? null);
  });
}
