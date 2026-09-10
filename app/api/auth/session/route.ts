import { NextResponse } from 'next/server';
import { clearSessionCookieHeader, getSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    address: session.address,
    exp: session.exp,
  });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.set('Set-Cookie', clearSessionCookieHeader());
  return res;
}
