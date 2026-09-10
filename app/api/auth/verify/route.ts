import { NextResponse } from 'next/server';
import {
  assertChallengeValid,
  mintSessionToken,
  sessionCookieHeader,
  verifyWalletSignature,
} from '@/lib/server/auth';
import { ApiError } from '@/lib/server/errors';
import { RATE, rateLimitOrThrow } from '@/lib/server/rate-limit';
import { readBody } from '@/lib/server/respond';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    rateLimitOrThrow(request, 'auth:verify', RATE.auth.limit, RATE.auth.windowMs);
    const body = await readBody<{
      address?: string;
      nonce?: string;
      expiresAt?: number;
      message?: string;
      challengeId?: string;
      signature?: string;
      identity?: string;
      signType?: string;
    }>(request);

    const address = body.address ?? '';
    const nonce = body.nonce ?? '';
    const expiresAt = Number(body.expiresAt ?? 0);
    const message = body.message ?? '';
    const challengeId = body.challengeId ?? '';

    assertChallengeValid({ address, nonce, expiresAt, message, challengeId });

    const ok = await verifyWalletSignature({
      message,
      signature: body.signature ?? '',
      identity: body.identity ?? '',
      signType: body.signType ?? '',
    });
    if (!ok) throw new ApiError('Signature verification failed.', 401);

    const { token, exp } = mintSessionToken(address);
    const res = NextResponse.json({ ok: true, address: address.trim(), exp });
    res.headers.set('Set-Cookie', sessionCookieHeader(token, exp));
    return res;
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: 'Sign-in failed.' }, { status: 500 });
  }
}
