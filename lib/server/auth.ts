/**
 * Wallet session auth — challenge + CCC message signature + HMAC cookie.
 * Stateless challenges (HMAC-bound); sessions verified via AUTH_SECRET.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import * as ccc from '@ckb-ccc/core';
import { ApiError } from '@/lib/server/errors';

const COOKIE = 'kr_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

function authSecret(): string {
  const s = process.env.AUTH_SECRET?.trim() || process.env.DATABASE_URL?.trim();
  if (!s) {
    if (process.env.NODE_ENV === 'production') {
      throw new ApiError('AUTH_SECRET is required in production.', 500);
    }
    return 'keepers-relay-dev-auth-secret';
  }
  return s;
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b.toString('base64url');
}

function hmac(data: string): string {
  return createHmac('sha256', authSecret()).update(data).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function buildLoginMessage(input: {
  address: string;
  nonce: string;
  expiresAt: number;
}): string {
  // Short copy — wallets show this as a signature step of Connect, not a second login.
  return `Connect to Keepers Relay\n${input.address.trim()}\n${input.nonce}\n${input.expiresAt}`;
}

export function createChallenge(address: string): {
  address: string;
  nonce: string;
  expiresAt: number;
  message: string;
  challengeId: string;
} {
  const addr = address.trim();
  if (!addr) throw new ApiError('Address required.', 400);
  const nonce = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const message = buildLoginMessage({ address: addr, nonce, expiresAt });
  const challengeId = hmac(`${normalizeAddress(addr)}|${nonce}|${expiresAt}|${message}`);
  return { address: addr, nonce, expiresAt, message, challengeId };
}

export function assertChallengeValid(input: {
  address: string;
  nonce: string;
  expiresAt: number;
  message: string;
  challengeId: string;
}): void {
  if (Date.now() > input.expiresAt) {
    throw new ApiError('Login challenge expired. Request a new one.', 401);
  }
  const expectedMessage = buildLoginMessage({
    address: input.address,
    nonce: input.nonce,
    expiresAt: input.expiresAt,
  });
  if (input.message !== expectedMessage) {
    throw new ApiError('Login message mismatch.', 401);
  }
  const expectedId = hmac(
    `${normalizeAddress(input.address)}|${input.nonce}|${input.expiresAt}|${input.message}`,
  );
  if (!safeEqual(expectedId, input.challengeId)) {
    throw new ApiError('Invalid login challenge.', 401);
  }
}

export type SessionPayload = {
  address: string;
  exp: number;
};

export function mintSessionToken(address: string): { token: string; exp: number } {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = b64url(JSON.stringify({ address: normalizeAddress(address), exp }));
  const sig = hmac(payload);
  return { token: `${payload}.${sig}`, exp };
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  if (!safeEqual(hmac(payload), sig)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionPayload;
    if (!data?.address || typeof data.exp !== 'number') return null;
    if (Date.now() > data.exp) return null;
    return { address: normalizeAddress(data.address), exp: data.exp };
  } catch {
    return null;
  }
}

export function sessionCookieHeader(token: string, exp: number): string {
  const maxAge = Math.max(0, Math.floor((exp - Date.now()) / 1000));
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readSessionCookie(request: Request): string | null {
  const raw = request.headers.get('cookie') ?? '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function getSession(request: Request): SessionPayload | null {
  return verifySessionToken(readSessionCookie(request));
}

/** Require a valid session; optionally require it matches an address. */
export function requireSession(request: Request, matchAddress?: string): SessionPayload {
  const session = getSession(request);
  if (!session) throw new ApiError('Sign in with your wallet to continue.', 401);
  if (matchAddress && normalizeAddress(matchAddress) !== session.address) {
    throw new ApiError('Wallet session does not match this address.', 403);
  }
  return session;
}

export async function verifyWalletSignature(input: {
  message: string;
  signature: string;
  identity: string;
  signType: string;
}): Promise<boolean> {
  try {
    const sig = new ccc.Signature(input.signature, input.identity, input.signType as ccc.SignerSignType);
    return await ccc.Signer.verifyMessage(input.message, sig);
  } catch (err) {
    console.warn('[auth] verifyMessage failed:', err);
    return false;
  }
}

export { COOKIE as SESSION_COOKIE_NAME };
