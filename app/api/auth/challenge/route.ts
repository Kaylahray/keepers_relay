import { NextResponse } from 'next/server';
import { createChallenge } from '@/lib/server/auth';
import { ApiError } from '@/lib/server/errors';
import { RATE, rateLimitOrThrow } from '@/lib/server/rate-limit';
import { readBody } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    rateLimitOrThrow(request, 'auth:challenge', RATE.auth.limit, RATE.auth.windowMs);
    const body = await readBody<{ address?: string }>(request);
    const challenge = createChallenge(body.address ?? '');
    return NextResponse.json(challenge);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: 'Challenge failed.' }, { status: 500 });
  }
}
