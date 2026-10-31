'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { CarFront, Timer } from 'lucide-react';
import { leftMs, useNow } from '@/components/crown/BleedingClock';
import { Avatar } from '@/components/duel/Avatar';
import { useChainPictures } from '@/components/duel/useChainPictures';
import { Button } from '@/components/ui/Button';
import { Ckb, StatusChip } from '@/components/ui/kit';
import { ckbWhole, GAMES, type CrownRoom } from '@/lib/crown/rooms';

function clockFace(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** One crown in the lobby: its state, the prize, who holds it and what to beat, and the way in. */
export function CrownCard({ room }: { room: CrownRoom; index?: number }) {
  const now = useNow(room.status === 'live');
  const [kingPicture] = useChainPictures([room.kingHash]);
  const href = `/play/${room.id}`;
  const left = room.status === 'live' && room.deadlineAt != null ? leftMs(room.deadlineAt, now) : 0;
  const live = room.status === 'live' && left > 0;
  const closed = room.status === 'settled' || (room.status === 'live' && left <= 0);
  const urgent = live && left < 120_000;

  return (
    <article className="clip-panel group relative flex h-full flex-col bg-ink-2 p-5 transition-colors duration-150 hover:bg-ink-3">
      <div className="flex items-center justify-between">
        {live ? <StatusChip tone="live">Live</StatusChip> : closed ? <StatusChip tone="closed">Closed</StatusChip> : <StatusChip tone="lobby">Lobby</StatusChip>}
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-mute">
          <CarFront className="h-3.5 w-3.5" aria-hidden="true" /> {GAMES[room.game].title}
        </span>
      </div>
      <h3 className="mt-4 font-poster text-lg font-bold uppercase leading-tight">
        <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none">
          {room.title}
        </Link>
      </h3>

      <div className="mt-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-mute">{closed ? 'Won' : 'Prize pot'}</p>
        <Ckb value={ckbWhole(room.potShannons)} size="lg" className="mt-1" />
      </div>

      <div className="mt-5 flex items-center gap-3 rounded-xl bg-ink px-3 py-2.5">
        {room.king ? (
          <>
            <Avatar name={room.king} tone="#e1bf47" size={32} src={kingPicture} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{room.king}</p>
              <p className="text-[11px] text-mute">{closed ? 'took the pot' : 'holds the crown'}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-bold">{room.kingScore}</p>
              <p className="text-[11px] text-mute">to beat</p>
            </div>
          </>
        ) : (
          <p className="py-1.5 text-sm text-mute">No crown yet. First run takes it.</p>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between pt-5">
        {live ? (
          <span className={`inline-flex items-center gap-1.5 font-mono text-sm font-bold tabular-nums ${urgent ? 'text-danger' : 'text-white'}`}>
            <Timer className="h-4 w-4" aria-hidden="true" />
            {clockFace(left)}
          </span>
        ) : closed ? (
          <span className="text-sm text-mute">Finished</span>
        ) : (
          <span className="text-sm text-mute">
            Entry <span className="font-mono font-bold text-gold">{ckbWhole(room.feeShannons)} CKB</span>
          </span>
        )}
        <Button href={href} size="sm" variant={closed ? 'ghost' : 'lime'} className="relative z-10">
          {closed ? 'See result' : live ? 'Play' : 'Enter'}
        </Button>
      </div>
    </article>
  );
}

/** A plain dark panel for a page section. */
export function NeonPlate({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`clip-panel relative bg-ink-2 text-white ${className}`}>{children}</section>;
}
