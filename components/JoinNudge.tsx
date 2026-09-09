'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';

/** Soft path onto the crew — never blocks browsing, never auto-signs a second cell. */
export function JoinNudge() {
  const pathname = usePathname();
  const { isConnected, isReady } = useWallet();
  const myBuilder = useMyBuilder();
  const { username, isLoading } = useUsername();

  if (pathname === '/join') return null;
  if (!isReady || !isConnected || isLoading) return null;
  if (username?.username || myBuilder.data?.builder?.onboarded) return null;

  return (
    <div className="mx-3 mt-3 border border-[#99ee2d]/35 bg-black/60 px-4 py-3 text-white backdrop-blur-md sm:mx-6">
      <p className="text-sm font-light text-white/85">
        Wallet connected. Claim an @handle to join events — watching is free.
      </p>
      <Link
        href={`/join?next=${encodeURIComponent(pathname || '/')}`}
        className="arena-cta mt-2 inline-block px-3 py-2 text-[10px] font-bold uppercase tracking-wider"
      >
        Claim handle
      </Link>
    </div>
  );
}
