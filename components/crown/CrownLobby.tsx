'use client';

import { useEffect } from 'react';
import { InviteButton } from '@/components/InviteButton';
import { PlayCode } from '@/components/crown/PlayCode';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { Avatar } from '@/components/duel/Avatar';
import { useChainPictures } from '@/components/duel/useChainPictures';
import { Button } from '@/components/ui/Button';
import { Ckb, StatusChip } from '@/components/ui/kit';
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
  const seatPictures = useChainPictures(seats.map((seat) => seat.address));
  const slots: Array<CrownSeat | null> = seats.slice();
  while (slots.length < Math.max(4, seats.length + 1)) slots.push(null);

  return (
    <div className="relative z-10">
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip tone="lobby">Lobby</StatusChip>
        <span className="font-mono text-[11px] text-mute">Lane runner · {seats.length} seated</span>
      </div>
      <h1 className="mt-3 font-poster text-3xl font-black uppercase md:text-5xl">{room.title}</h1>
      <p className="mt-2 max-w-xl text-mute">Share the link. Players connect and take a seat, then the host starts the clock.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section className="clip-panel bg-ink-2 p-6 md:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-mute">Entry</p>
                <Ckb value={ckbWhole(room.feeShannons)} size="xl" className="mt-2" />
              </div>
              <div className="sm:text-right">
                <p className="font-mono text-[11px] uppercase tracking-wider text-mute">Clock starts at the first run</p>
                <p className="mt-1 font-poster text-4xl font-black tabular-nums">{Math.round(room.durationMs / 60_000)} min</p>
              </div>
            </div>
            {iHost ? (
              <p className="mt-6 rounded-2xl bg-ink p-4 text-sm text-mute">
                {`Pressing start opens the match on chain, which takes 20 to 90 seconds. Players then get up to 3 minutes to lock their entry, and your ${Math.round(room.durationMs / 60_000)} minute clock starts for everyone at the same moment after it. Approve quickly: the time you take comes out of those 3 minutes (they never drop below 2; past that it comes off your clock).`}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <InviteButton url={crownShareUrl(room)} title={room.title} text={`Join ${room.title} on Crowns.`} variant="arena" />
              {!isConnected ? (
                <ArenaCta onClick={() => void ensureAuth().catch(() => undefined)}>Connect wallet</ArenaCta>
              ) : iHost ? (
                <>
                  <ArenaCta onClick={onStart} disabled={Boolean(busy)}>
                    {busy ?? 'Start the game'}
                  </ArenaCta>
                  {onDelete ? (
                    <Button variant="outline" size="lg" onClick={onDelete} disabled={Boolean(busy)}>
                      {busy === 'Deleting…' ? busy : 'Delete lobby'}
                    </Button>
                  ) : null}
                </>
              ) : (
                <p className="self-center text-sm text-mute">{seated ? 'You’re in. Waiting for the host.' : 'Taking your seat…'}</p>
              )}
            </div>
            {error ? <p className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}
          </section>

          <section aria-labelledby="room" className="rounded-2xl bg-ink-2 p-5">
            <h2 id="room" className="font-poster text-sm font-bold uppercase">
              In the room <span className="ml-1 font-mono text-xs text-mute">{seats.length}</span>
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {slots.map((seat, index) => {
                const live = seat ? now - seat.lastSeenAt < 20_000 : false;
                const you = seat && mine && seat.address === mine;
                if (!seat) {
                  return (
                    <li key={`open-${index}`} className="flex items-center gap-3 rounded-xl border-2 border-dashed border-white/10 p-3">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 font-mono text-xs text-mute">{index + 1}</span>
                      <span className="text-sm text-mute">Empty seat</span>
                    </li>
                  );
                }
                return (
                  <li key={seat.address} className={`flex items-center gap-3 rounded-xl p-3 ${you ? 'bg-lime/10 ring-2 ring-inset ring-lime' : 'bg-ink'}`}>
                    <span className="relative">
                      <Avatar name={seat.displayName} tone="#99ee2d" size={40} src={seatPictures[seats.indexOf(seat)] ?? null} />
                      <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-ink-2 ${live ? 'bg-lime' : 'bg-white/30'}`} aria-label={live ? 'Here' : 'Away'} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {seat.displayName}
                        {you ? ' · you' : ''}
                      </span>
                      <span className="font-mono text-[10px] uppercase text-mute">
                        {host && seat.address === host ? 'Host' : 'Player'} · {live ? 'Here' : 'Away'}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <aside className="flex flex-col items-center justify-center rounded-2xl bg-lime p-6 text-center text-ink">
          <p className="font-poster text-xl font-black uppercase">Scan to play</p>
          <div className="mt-4">
            <PlayCode id={room.id} size={180} caption={false} />
          </div>
          <p className="mt-3 text-sm font-semibold">Entry {ckbWhole(room.feeShannons)} CKB</p>
        </aside>
      </div>
    </div>
  );
}
