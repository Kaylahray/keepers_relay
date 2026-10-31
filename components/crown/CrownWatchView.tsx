'use client';

import Link from 'next/link';
import { ccc } from '@ckb-ccc/connector-react';
import { ArrowLeft, Crown } from 'lucide-react';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { ChainLoader } from '@/components/arena/ChainLoader';
import { Avatar } from '@/components/duel/Avatar';
import { useChainPictures } from '@/components/duel/useChainPictures';
import { Logo } from '@/components/SiteHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/kit';
import { leftMs, playClock, useNow } from '@/components/crown/BleedingClock';
import { PlayCode } from '@/components/crown/PlayCode';
import { VerifiedSeal } from '@/components/crown/VerifiedSeal';
import { useCrown } from '@/components/crown/useCrown';
import { useWallet } from '@/hooks/useWallet';
import { useMyLockHash } from '@/hooks/useMyLockHash';
import { DEFAULT_DURATION_MS, ckbWhole } from '@/lib/crown/rooms';
import { isHostWallet } from '@/lib/crown/standing';

function scriptHash(lock: { codeHash: string; hashType: 'type' | 'data' | 'data1' | 'data2'; args: string }) {
  return ccc.Script.from(lock).hash();
}

export function CrownWatchView({ id }: { id: string }) {
  const { room, ready, unreachable } = useCrown(id);
  const { address } = useWallet();
  const myLockHash = useMyLockHash();
  const now = useNow(room?.status === 'live');
  const [kingPicture] = useChainPictures([room?.kingHash]);
  const playPath = `/play/${id}`;

  const panic =
    room?.status === 'live' && room.deadlineAt != null && leftMs(room.deadlineAt, now) <= 4_000 && leftMs(room.deadlineAt, now) > 0;

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
        <EmptyState title={unreachable ? 'Connection lost' : 'Game not found'} body={unreachable ? 'Could not reach this game. Retrying…' : 'This game does not exist or was deleted.'} />
      </ArenaStage>
    );
  }

  let paidYou = false;
  if (room.kingLock && myLockHash) {
    try {
      paidYou = scriptHash(room.kingLock).toLowerCase() === myLockHash.toLowerCase();
    } catch {
      paidYou = false;
    }
  }
  if (!paidYou && room.king && address) {
    const mine = address.trim().toLowerCase();
    paidYou = room.king.toLowerCase() === `${mine.slice(0, 8)}…${mine.slice(-6)}`;
  }
  const iHost = isHostWallet(room, address, myLockHash);
  const closed = room.status === 'settled';
  const kingName = paidYou ? 'You' : room.king;
  const clock = playClock(room.deadlineAt, now);
  const total = room.durationMs || DEFAULT_DURATION_MS;
  const pct = room.status === 'live' && room.deadlineAt != null ? Math.min(100, (leftMs(room.deadlineAt, now) / total) * 100) : room.status === 'lobby' ? 100 : 0;
  const latest = room.feed[0];

  return (
    <div className="flex min-h-screen w-full flex-col p-5 md:p-10">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={playPath} aria-label="Back to the crown" className="grid h-11 w-11 place-items-center rounded-xl bg-ink-3">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Logo size="lg" />
        </div>
        <p className="hidden truncate font-poster text-2xl font-black uppercase lg:block">{room.title}</p>
        <div className="flex gap-2">
          {iHost ? (
            <Button href={`/host/${id}`} variant="outline" size="sm">
              Your game
            </Button>
          ) : null}
          {room.matchOutPoint ? (
            <Button href={`/verify/${room.matchOutPoint.txHash}`} variant="outline" size="sm">
              Check it
            </Button>
          ) : null}
        </div>
      </header>

      <div className="mt-8 grid flex-1 gap-8 lg:grid-cols-[minmax(260px,340px)_1fr_minmax(300px,400px)]">
        <section aria-label="Join" className="clip-panel flex flex-col items-center justify-center bg-lime p-8 text-center text-ink">
          <p className="font-poster text-2xl font-black uppercase">Scan to play</p>
          <div className="mt-6">
            <PlayCode id={id} size={220} caption={false} />
          </div>
          <p className="mt-2 text-lg font-semibold">Entry {ckbWhole(room.feeShannons)} CKB</p>
        </section>

        <section aria-label="Prize and clock" className="flex flex-col items-center justify-center text-center">
          <p className="font-mono text-xl uppercase tracking-[0.2em] text-mute">{closed ? 'Prize paid' : 'Prize pot'}</p>
          <p className="mt-2 font-poster text-[clamp(64px,10vw,160px)] font-black leading-none tabular-nums text-gold">
            {ckbWhole(room.potShannons)}
            <span className="ml-3 font-mono text-[0.22em] font-bold">CKB</span>
          </p>
          {closed ? (
            <p className="mt-6 font-poster text-[clamp(48px,7vw,112px)] font-black uppercase leading-none text-lime">Paid</p>
          ) : (
            <p className={`mt-6 font-poster text-[clamp(48px,7vw,112px)] font-black leading-none tabular-nums ${panic ? 'clock-urgent text-danger' : 'text-white'}`}>
              {room.status === 'lobby' ? `${Math.round(total / 60_000)}:00` : clock.face}
            </p>
          )}
          {!closed ? (
            <div className="mt-6 h-4 w-full max-w-xl overflow-hidden rounded-full bg-white/10">
              <div className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${pct < 10 ? 'bg-danger' : 'bg-lime'}`} style={{ width: `${pct}%` }} />
            </div>
          ) : null}
          {kingName ? (
            <div className="mt-10 flex items-center gap-5">
              <Avatar name={kingName} tone="#e1bf47" size={128} src={kingPicture} />
              <div className="text-left">
                <p className="text-xl text-mute">{closed ? 'Took the pot' : 'Holds the crown'}</p>
                <p className="font-poster text-4xl font-black">{kingName}</p>
                <p className="font-mono text-2xl font-bold text-gold">{room.kingScore}</p>
              </div>
            </div>
          ) : (
            <p className="mt-10 font-poster text-3xl font-black uppercase text-mute">
              {room.status === 'lobby' ? 'Waiting for the clock to start' : closed ? 'Nobody took the crown' : 'First run takes the crown'}
            </p>
          )}
        </section>

        <section aria-labelledby="board" className="rounded-3xl bg-ink-2 p-6">
          <h2 id="board" className="font-poster text-xl font-black uppercase">
            Crown steals
          </h2>
          <ol className="mt-5 space-y-3">
            {room.feed.slice(0, 7).map((item, i) => (
              <li key={`${item.id}-${i}`} className={`flex items-center gap-4 rounded-2xl p-3 ${i === 0 && item.good ? 'bg-gold text-ink' : 'bg-ink'}`}>
                <Crown className={`h-6 w-6 shrink-0 ${i === 0 && item.good ? 'fill-ink' : item.good ? 'fill-gold text-gold' : 'text-mute'}`} aria-hidden="true" />
                <span className="flex-1 text-lg font-bold">{item.text}</span>
              </li>
            ))}
            {!room.feed.length ? <li className="text-lg text-mute">No runs yet. Be first.</li> : null}
          </ol>
          <ul className="mt-5 space-y-2">
            {room.seals.slice(0, 3).map((seal) => (
              <li key={seal.id}>
                <VerifiedSeal seal={seal} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      {latest ? (
        <footer className="mt-8 flex items-center gap-3 rounded-2xl bg-ink-2 px-6 py-4 text-lg" aria-live="polite">
          <Crown className="h-6 w-6 fill-gold text-gold" aria-hidden="true" />
          <span>{latest.text}</span>
        </footer>
      ) : null}
    </div>
  );
}
