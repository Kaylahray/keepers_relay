'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { playClock, useNow } from '@/components/crown/BleedingClock';
import { ChainLoader } from '@/components/arena/ChainLoader';
import { Button } from '@/components/ui/Button';
import { Ckb, EmptyState, StatusChip } from '@/components/ui/kit';
import { PlayCode } from '@/components/crown/PlayCode';
import { VerifiedSeal } from '@/components/crown/VerifiedSeal';
import { useCrown } from '@/components/crown/useCrown';
import { useWallet } from '@/hooks/useWallet';
import { useMyLockHash } from '@/hooks/useMyLockHash';
import { useAuth } from '@/context/auth-provider';
import { closeCrown } from '@/lib/crown/chain';
import { getCkbClient } from '@/lib/ckb/client';
import { suddenDeathConfigured } from '@/lib/registry/config';
import { isHostWallet } from '@/lib/crown/standing';
import { deleteCrownRemote } from '@/lib/crown/remote';
import { ckbWhole, forgetCrown, GAMES, loadCrown, saveCrown } from '@/lib/crown/rooms';

export function CrownDeskView({ id }: { id: string }) {
  const router = useRouter();
  const { room, ready, unreachable } = useCrown(id);
  const { address, isConnected } = useWallet();
  const { ensureAuth } = useAuth();
  const myLockHash = useMyLockHash();
  const now = useNow(room?.status === 'live');
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
      setChainError(error instanceof Error ? error.message : 'The game could not be deleted.');
      setBusy(null);
    }
  }

  async function close() {
    const current = loadCrown(id);
    if (!current) return;
    setBusy('Closing…');
    setChainError(null);
    try {
      const result = await closeCrown(getCkbClient(), current, myLockHash);
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
        <ChainLoader title="Loading the game…" />
      </ArenaStage>
    );
  }

  if (!room) {
    return (
      <ArenaStage backHref="/play" backLabel="Crowns">
        <EmptyState
          title={unreachable ? 'Connection lost' : 'Game not found'}
          body={unreachable ? 'Could not reach this game. Retrying…' : 'This game does not exist or was deleted.'}
          action={<Button href="/play">Find a crown</Button>}
        />
      </ArenaStage>
    );
  }

  const iHost = isHostWallet(room, address, myLockHash);
  const counting = playClock(room.deadlineAt, now).counting;

  return (
    <ArenaStage backHref={`/play/${room.id}`} backLabel="Back to the crown">
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip tone={room.status === 'live' ? 'live' : room.status === 'lobby' ? 'lobby' : 'closed'}>{room.status === 'settled' ? 'Closed' : room.status}</StatusChip>
        <span className="font-mono text-[11px] text-mute">{GAMES[room.game].title} · your game</span>
      </div>
      <h1 className="mt-3 font-poster text-3xl font-black uppercase md:text-5xl">{room.title}</h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section className="clip-panel bg-ink-2 p-6 md:p-8">
            <div className="grid gap-6 sm:grid-cols-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-mute">Prize pot</p>
                <Ckb value={ckbWhole(room.potShannons)} size="lg" className="mt-1" />
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-mute">Entry</p>
                <Ckb value={ckbWhole(room.feeShannons)} size="lg" className="mt-1" />
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-mute">Crown holder</p>
                <p className="mt-1 truncate font-poster text-lg font-bold">{room.king ? `${room.king} · ${room.kingScore}` : 'Nobody yet'}</p>
              </div>
            </div>
            <p className="mt-6 text-sm text-mute">
              {iHost ? 'You are the host.' : isConnected ? 'You are playing in this game.' : 'Connect a wallet to see your part in this game.'}
              {room.status === 'lobby' ? ' Players join from the lobby link.' : ''}
            </p>
            {!iHost && !isConnected ? (
              <Button className="mt-4" onClick={() => void ensureAuth().catch(() => undefined)}>
                Connect
              </Button>
            ) : null}
          </section>

          {chain && room.matchId && room.status === 'live' ? (
            <section className="clip-panel bg-gold/10 p-6">
              <Button variant="gold" size="lg" onClick={() => void close()} disabled={Boolean(busy) || counting}>
                {busy === 'Closing…' ? busy : 'End the game and pay the winner'}
              </Button>
              <p className="mt-3 max-w-xl text-sm text-mute">
                {counting ? 'You can end it once the clock runs out.' : 'No wallet needed. The prize goes to the last player who grabbed the crown in time.'}
              </p>
            </section>
          ) : iHost && room.status !== 'live' ? (
            <section className="rounded-2xl bg-ink-2 p-6">
              <Button variant="outline" onClick={() => void removeCrown()} disabled={Boolean(busy)}>
                {busy === 'Deleting…' ? busy : 'Delete this game'}
              </Button>
              <p className="mt-3 max-w-xl text-sm text-mute">Removes it from the list. A live crown must be closed first.</p>
            </section>
          ) : null}
          {chainError ? <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{chainError}</p> : null}

          <section className="rounded-2xl bg-ink-2 p-5">
            <h2 className="font-poster text-sm font-bold uppercase">History</h2>
            <ul className="mt-3 space-y-2">
              {room.seals.length === 0 ? (
                <li className="text-sm text-mute">Nobody has grabbed the crown yet.</li>
              ) : (
                room.seals.map((seal) => (
                  <li key={seal.id}>
                    <VerifiedSeal seal={seal} />
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="flex flex-col items-center rounded-2xl bg-lime p-6 text-center text-ink">
            <p className="font-poster text-xl font-black uppercase">Scan to play</p>
            <div className="mt-4">
              <PlayCode id={room.id} size={160} caption={false} />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button href={`/play/${room.id}`}>Play</Button>
          </div>
        </aside>
      </div>
    </ArenaStage>
  );
}
