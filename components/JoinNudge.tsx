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
    <div className="mx-3 mt-3 border-[3px] border-black bg-[#ffe454] px-4 py-3 text-black shadow-[4px_4px_0_#101010] sm:mx-6">
      <p className="text-sm font-semibold">
        Wallet connected. Claim an @handle to hold or pass a Cell — watching is free.
      </p>
      <Link
        href={`/join?next=${encodeURIComponent(pathname || '/')}`}
        className="neo-button mt-2 inline-block bg-[#224cff] px-3 py-2 text-[10px] font-black uppercase text-[#fff8e7]"
      >
        Claim handle
      </Link>
    </div>
  );
}
