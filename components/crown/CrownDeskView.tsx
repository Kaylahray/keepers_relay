'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ccc } from '@ckb-ccc/connector-react';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { playClock, useNow } from '@/components/crown/BleedingClock';
import { NeonPlate } from '@/components/crown/CrownCard';
import { PlayCode } from '@/components/crown/PlayCode';
import { VerifiedSeal } from '@/components/crown/VerifiedSeal';
import { useCrown } from '@/components/crown/useCrown';
import { useWallet } from '@/hooks/useWallet';
import { useMyLockHash } from '@/hooks/useMyLockHash';
import { useAuth } from '@/context/auth-provider';
import { closeCrown } from '@/lib/crown/chain';
import { suddenDeathConfigured } from '@/lib/registry/config';
import { isHostWallet } from '@/lib/crown/standing';
import { deleteCrownRemote } from '@/lib/crown/remote';
import { ckbWhole, forgetCrown, GAMES, loadCrown, saveCrown } from '@/lib/crown/rooms';

export function CrownDeskView({ id }: { id: string }) {
  const router = useRouter();
  const { room, ready } = useCrown(id);
  const { address, isConnected } = useWallet();
  const { ensureAuth } = useAuth();
  const myLockHash = useMyLockHash();
  const now = useNow(room?.status === 'live');
  const signer = ccc.useSigner();
  const chain = suddenDeathConfigured();
  const [busy, setBusy] = useState<string | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);

  async function removeCrown() {
    setChainError(null);
    setBusy('Deleting…');
    try {
      await ensureAuth();
      await deleteCrownRemote(id);
      forgetCrown(id);
      router.push('/play');
    } catch (error) {
      setChainError(error instanceof Error ? error.message : 'The crown could not be deleted.');
      setBusy(null);
    }
  }

  async function close() {
    const current = loadCrown(id);
    if (!current || !signer) {
      setChainError('Connect a wallet. It only pays the closing fee.');
      return;
    }
    setBusy('Closing…');
    setChainError(null);
    try {
      const result = await closeCrown(signer, current);
      saveCrown(result.room);
    } catch (error) {
      setChainError(error instanceof Error ? error.message : 'Cleanup was rejected.');
    } finally {
      setBusy(null);
    }
  }

  if (!ready) {
    return (
      <ArenaStage>
        <p className="text-sm text-white/50">Loading crown.</p>
      </ArenaStage>
    );
  }

  if (!room) {
    return (
      <ArenaStage backHref="/play" backLabel="Crowns">
        <h1 className="font-poster text-5xl uppercase text-white">Missing crown</h1>
      </ArenaStage>
    );
  }

  const iHost = isHostWallet(room, address, myLockHash);
  const counting = playClock(room.deadlineAt, now).counting;

  return (
    <ArenaStage backHref="/play" backLabel="Crowns">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">Host desk</p>
      <h1 className="mt-2 font-poster text-5xl uppercase leading-none text-white sm:text-6xl">{room.title}</h1>
      <p className="mt-3 font-mono text-[10px] uppercase text-white/45">
        {GAMES[room.game].title} · {room.status} · {ckbWhole(room.feeShannons)} CKB entry · pot{' '}
        {ckbWhole(room.potShannons)} CKB · {room.king ? `${room.king} holds it with ${room.kingScore}` : 'Open seat'}
      </p>
      {room.status === 'lobby' ? (
        <p className="mt-4 max-w-xl text-sm text-white/70">
          Players join from the lobby link.{' '}
          <Link href={`/play/${room.id}`} className="border-b border-[#99ee2d] text-[#99ee2d]">
            Open the lobby
          </Link>
        </p>
      ) : null}
      {iHost ? (
        <p className="mt-4 max-w-xl text-sm text-white/70">
          You are the host.
        </p>
      ) : isConnected ? (
        <p className="mt-4 max-w-xl text-sm text-white/70">You are a player.</p>
      ) : (
        <div className="mt-4">
          <p className="max-w-xl text-sm text-white/70">Connect a wallet to close the crown.</p>
          <button type="button" onClick={() => void ensureAuth().catch(() => undefined)} className="arena-cta mt-3 px-4 py-2 font-mono text-[11px] font-bold uppercase">
            Connect
          </button>
        </div>
      )}
      {chain && room.matchId && room.status === 'live' && isConnected ? (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => void close()}
            disabled={Boolean(busy) || counting}
            className="bg-[#e1bf47] px-5 py-3 font-poster text-3xl uppercase leading-none text-[#111] disabled:opacity-40"
          >
            {busy === 'Closing…' ? busy : 'Close the crown'}
          </button>
          <p className="mt-3 max-w-xl text-sm text-white/60">
            {counting
              ? 'Opens when the clock runs out.'
              : 'Pays whoever holds the crown.'}
          </p>
        </div>
      ) : iHost && room.status !== 'live' ? (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => void removeCrown()}
            disabled={Boolean(busy)}
            className="border border-white/20 px-4 py-2 font-mono text-[11px] uppercase text-white/70 disabled:opacity-40"
          >
            {busy === 'Deleting…' ? busy : 'Delete this crown'}
          </button>
          <p className="mt-3 max-w-xl text-sm text-white/60">
            Removes it from the list. A live crown must be closed first.
          </p>
        </div>
      ) : null}
      {chainError ? <p className="mt-3 text-sm text-[#af2a3a]">{chainError}</p> : null}
      <div className="mt-8">
        <PlayCode id={room.id} size={120} />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href={`/play/${room.id}`} className="arena-cta px-4 py-2 font-mono text-[11px] font-bold uppercase">
          Play
        </Link>
        <Link href={`/watch/${room.id}`} className="border border-[#e1bf47] px-4 py-2 font-mono text-[11px] uppercase text-[#e1bf47]">
          Watch
        </Link>
      </div>

      <NeonPlate className="mt-6 p-4">
        <p className="font-mono text-[10px] uppercase text-white/40">Seals</p>
        <ul className="mt-3 space-y-2">
          {room.seals.length === 0 ? (
            <li className="text-sm text-white/40">No crown taken yet.</li>
          ) : (
            room.seals.map((seal) => (
              <li key={seal.id}>
                <VerifiedSeal seal={seal} />
              </li>
            ))
          )}
        </ul>
      </NeonPlate>
    </ArenaStage>
  );
}
