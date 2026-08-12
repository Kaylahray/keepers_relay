import { checkUsernameAvailable } from '@/lib/server/store';
import { respond } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const username = new URL(request.url).searchParams.get('username') ?? '';
  const except = new URL(request.url).searchParams.get('except') ?? undefined;
  return respond(() => checkUsernameAvailable(username, except ?? undefined));
}
