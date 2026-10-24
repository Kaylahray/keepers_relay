import Link from 'next/link';
import type { ReactNode } from 'react';
import { arenaCoverForSeed } from '@/lib/poster';
import { ckbWhole, GAMES, type CrownRoom, type CrownStatus } from '@/lib/crown/rooms';

const YELLOW = { bg: '#e1bf47', ink: '#111', mute: 'rgba(17,17,17,0.7)' };

function statusWord(status: CrownStatus) {
  if (status === 'live') return 'Live';
  if (status === 'lobby') return 'Sealed';
  return 'Settled';
}

export function CrownCard({ room }: { room: CrownRoom; index?: number }) {
  const plate = YELLOW;
  const href = `/play/${room.id}`;
  const art = arenaCoverForSeed(room.id);

  return (
    <Link
      href={href}
      className="arena-card group relative block h-[380px] overflow-hidden shadow-[-12px_0_24px_rgba(153,238,45,0.12)] sm:h-[400px]"
      style={{ background: plate.bg, color: plate.ink }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{ backgroundImage: "url('/uismod/noise.png')", backgroundSize: '440px' }}
        aria-hidden
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={art}
        alt=""
        className="pointer-events-none absolute -right-4 bottom-16 h-[78%] w-auto max-w-[85%] object-contain object-bottom transition group-hover:scale-[1.03]"
      />

      <div className="relative z-10 p-5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: plate.mute }}>
          {statusWord(room.status)}
        </p>
        <h3 className="mt-2 max-w-[70%] font-poster text-[2rem] uppercase leading-none sm:text-[2.4rem]">
          {room.title}
        </h3>
        <p className="mt-3 text-sm font-light" style={{ color: plate.mute }}>
          {room.king ? `${room.king} · ${room.kingScore}` : 'Open seat'} · {GAMES[room.game].title}
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 flex h-24 items-center justify-between gap-3 bg-black/50 px-4 text-white backdrop-blur-[8px]">
        <div className="flex gap-4">
          <div>
            <p className="text-[11px] opacity-60">Pot</p>
            <p className="text-sm font-bold">{ckbWhole(room.potShannons)} CKB</p>
          </div>
          <div>
            <p className="text-[11px] opacity-60">Fee</p>
            <p className="text-sm font-bold">{ckbWhole(room.feeShannons)} CKB</p>
          </div>
        </div>
        <span className="arena-cta-light inline-flex items-center gap-1 py-2 pl-5 pr-8 text-sm font-bold uppercase tracking-wide">
          {room.status === 'lobby' ? 'Host' : room.status === 'live' ? 'Play' : 'Result'}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/uismod/arrow-right.svg" alt="" className="size-5" />
        </span>
      </div>
    </Link>
  );
}

export function NeonPlate({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`relative border border-white/15 bg-black/40 text-white ${className}`}>
      {children}
    </section>
  );
}
