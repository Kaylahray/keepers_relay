'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { useWallet } from '@/hooks/useWallet';

/** Bare /profile — resolve to connected wallet passport. */
export default function ProfileIndexPage() {
  const router = useRouter();
  const { address, isConnected, connect, isReady } = useWallet();

  useEffect(() => {
    if (!isReady) return;
    if (isConnected && address) {
      router.replace(`/profile/${encodeURIComponent(address)}`);
    }
  }, [isReady, isConnected, address, router]);

  return (
    <ArenaStage backHref="/" backLabel="Home">
      <div className="max-w-lg">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
          Profile
        </p>
        <h1 className="mt-3 font-poster text-4xl uppercase text-white">Your profile</h1>
        {!isReady || (isConnected && address) ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-white/55">
            <Loader2 className="h-4 w-4 animate-spin" /> Opening profile…
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm text-white/55">
              Connect a wallet to open Studio, mint a Spore avatar, and see your events.
            </p>
            <ArenaCta onClick={() => connect()} className="mt-6">
              Connect wallet
            </ArenaCta>
          </>
        )}
      </div>
    </ArenaStage>
  );
}
