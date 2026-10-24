'use client';

import { useEffect } from 'react';
import { InviteButton } from '@/components/InviteButton';
import { PlayCode } from '@/components/crown/PlayCode';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { useWallet } from '@/hooks/useWallet';
import { useAuth } from '@/context/auth-provider';
import { joinCrownRemote } from '@/lib/crown/remote';
import type { CrownSeat } from '@/lib/crown/seats';
import { ckbWhole, crownShareUrl, type CrownRoom } from '@/lib/crown/rooms';
import { useNow } from '@/components/crown/BleedingClock';
import { sameAddress } from '@/lib/crown/standing';

export function CrownLobby({
  room,
  seats,
  busy,
  error,
  onStart,
  onDelete,
}: {
  room: CrownRoom;
  seats: CrownSeat[];
  busy: string | null;
  error: string | null;
  onStart: () => void;
  onDelete?: () => void;
}) {
  const { address, formattedAddress, isConnected } = useWallet();
  const { ensureAuth, authenticated } = useAuth();
  const name = formattedAddress || 'Player';
  const mine = address.trim().toLowerCase();
  const host = (room.hostAddress ?? '').toLowerCase();
  const iHost = sameAddress(room.hostAddress, address);
  const seated = mine ? seats.some((seat) => seat.address === mine) : false;

  useEffect(() => {
    if (!isConnected || !authenticated || !mine) return;
    const beat = () => {
      void joinCrownRemote(room.id, { address: mine, displayName: name }).catch(() => undefined);
    };
    beat();
    const timer = window.setInterval(beat, 8000);
    return () => window.clearInterval(timer);
  }, [authenticated, isConnected, mine, name, room.id]);

  // Ticks once a second so a seat goes quiet on screen without a new poll.
  const now = useNow(true);
  const slots: Array<CrownSeat | null> = seats.slice();
  while (slots.length < Math.max(4, seats.length + 1)) slots.push(null);

  return (
    <div className="relative z-10 max-w-3xl">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
        Lobby · {room.title}
      </p>
      <h1 className="mt-3 font-poster text-[clamp(2.75rem,6vw,4.5rem)] uppercase leading-[0.92] text-white">
        {room.title}
      </h1>
      <p className="mt-4 max-w-xl text-base font-light leading-relaxed text-white/60">
        Share the link. Players connect and take a seat, then the host starts the clock.
      </p>
      <p className="mt-3 font-mono text-[11px] uppercase text-[#e1bf47]">
        {ckbWhole(room.feeShannons)} CKB entry · {seats.length} seated
      </p>
      {iHost ? (
        <p className="mt-3 max-w-md text-sm leading-relaxed text-white/55">
          Pressing start opens the match on chain, which takes 20 to 90 seconds. Players then get a 3 minute
          entry window to lock their entry, and your {Math.round(room.durationMs / 60_000)} minute clock starts for
          everyone at the same moment after it.
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <InviteButton url={crownShareUrl(room)} title={room.title} text={`Join ${room.title} on Crowns.`} variant="arena" />
        {!isConnected ? (
          <ArenaCta onClick={() => void ensureAuth().catch(() => undefined)}>Connect wallet</ArenaCta>
        ) : iHost ? (
          <>
            <ArenaCta onClick={onStart} disabled={Boolean(busy)}>
              {busy ?? 'Start the clock'}
            </ArenaCta>
            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={Boolean(busy)}
                className="border border-white/20 px-4 py-2 font-mono text-[11px] uppercase text-white/70 disabled:opacity-40"
              >
                {busy === 'Deleting…' ? busy : 'Delete lobby'}
              </button>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-white/55">{seated ? 'You are in. Waiting for the host.' : 'Taking your seat…'}</p>
        )}
      </div>
      {error ? <p className="mt-4 text-sm text-[#af2a3a]">{error}</p> : null}
      <div className="mt-8">
        <PlayCode id={room.id} size={148} />
      </div>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {slots.map((seat, index) => {
          const live = seat ? now - seat.lastSeenAt < 20_000 : false;
          const you = seat && mine && seat.address === mine;
          if (!seat) {
            return (
              <li key={`open-${index}`} className="border border-dashed border-white/20 px-4 py-4">
                <p className="font-mono text-[10px] uppercase text-white/35">Slot {index + 1}</p>
                <p className="mt-2 font-poster text-2xl uppercase text-white/25">Open</p>
              </li>
            );
          }
          return (
            <li key={seat.address} className={`border px-4 py-4 ${you ? 'border-[#99ee2d] bg-[#99ee2d]/10' : 'border-white/15 bg-black/40'}`}>
              <div className="flex items-center gap-3">
                <span className="relative flex h-11 w-11 items-center justify-center border border-white/20 font-poster text-lg uppercase text-white">
                  {seat.displayName.slice(0, 1)}
                  <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#111] ${live ? 'animate-pulse bg-[#99ee2d]' : 'bg-white/30'}`} />
                </span>
                <span>
                  <span className="block font-poster text-xl uppercase text-white">
                    {seat.displayName}
                    {you ? ' · you' : ''}
                  </span>
                  <span className="font-mono text-[10px] uppercase text-white/45">
                    {host && seat.address === host ? 'Host' : 'Player'} · {live ? 'Here' : 'Away'}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
