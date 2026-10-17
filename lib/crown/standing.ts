import type { CrownRoom } from '@/lib/crown/rooms';

export function sameAddress(left: string | null | undefined, right: string | null | undefined) {
  const a = (left ?? '').trim().toLowerCase();
  const b = (right ?? '').trim().toLowerCase();
  return Boolean(a && b && a === b);
}

/** Host is the wallet that opened the lobby, matched by address or lock hash. */
export function isHostWallet(
  room: Pick<CrownRoom, 'hostAddress' | 'hostLockHash'>,
  address: string,
  lockHash: string | null,
) {
  if (sameAddress(room.hostAddress, address)) return true;
  const hostLock = (room.hostLockHash ?? '').trim().toLowerCase();
  const mine = (lockHash ?? '').trim().toLowerCase();
  return Boolean(hostLock && mine && hostLock === mine);
}
