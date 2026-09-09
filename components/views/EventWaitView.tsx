'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { InviteButton } from '@/components/InviteButton';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { EventRulesStrip } from '@/components/arena/EventRulesStrip';
import { useEventQuery, useStartEvent } from '@/hooks/useEvents';
import { useWallet } from '@/hooks/useWallet';
import type { EventPlayer } from '@/types/event';

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** COD-style party lobby — roster slots, pot, invite, host start. */
export function EventWaitView({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { data, isLoading } = useEventQuery(eventId);
  const { address } = useWallet();
  const start = useStartEvent(eventId);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (data?.event.status === 'live') {
      router.replace(`/events/${eventId}/live`);
    }
  }, [data?.event.status, eventId, router]);

  const slots = useMemo(() => {
    if (!data) return [] as Array<EventPlayer | null>;
    const max = Math.max(data.event.maxPlayers, data.players.length, data.event.minPlayers);
    const list: Array<EventPlayer | null> = [...data.players];
    while (list.length < max) list.push(null);
    return list;
  }, [data]);

  if (isLoading || !data) {
    return (
      <ArenaStage backHref={`/events/${eventId}`} backLabel="Event">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </ArenaStage>
    );
  }

  const { event, players } = data;
  const isHost = Boolean(
    address && event.hostAddress.toLowerCase() === address.toLowerCase(),
  );
  const iAmIn = Boolean(
    address && players.some((p) => p.address.toLowerCase() === address.toLowerCase()),
  );
  const startMs = new Date(event.startAt).getTime() - now;
  const ready = event.playerCount >= event.minPlayers;
  const need = Math.max(0, event.minPlayers - event.playerCount);
  const fillPct = Math.min(100, Math.round((event.playerCount / event.minPlayers) * 100));

  return (
    <ArenaStage backHref={`/events/${eventId}`} backLabel="Event">
      <div className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#99ee2d]/15 blur-[90px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 h-64 w-64 rounded-full bg-[#ff56f6]/10 blur-[80px]"
          aria-hidden
        />

        <header className="relative z-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-[#99ee2d]">
              Lobby · {event.status}
            </p>
            <h1 className="mt-3 max-w-2xl font-poster text-[clamp(2.6rem,7vw,4.75rem)] uppercase leading-[0.9] text-white">
              {event.name}
            </h1>
            <p className="mt-3 max-w-lg text-sm font-light text-white/55">
              Invite your squad. Lock seats. When the lobby fills, the host drops the match —
              then every move can grow the pot and reset the clock.
            </p>
            <div className="mt-5">
              <EventRulesStrip
                playRules={event.playRules}
                turnSecs={event.turnSecs}
                questionSource={event.questionSource}
                winnersCount={event.winnersCount}
              />
            </div>
          </div>

          <div className="min-w-[11rem] border border-[#99ee2d]/35 bg-black/50 px-5 py-4 text-right backdrop-blur-md">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
              Prize pot
            </p>
            <p className="mt-1 font-poster text-4xl uppercase tabular-nums text-[#99ee2d]">
              {event.pot}
            </p>
            <p className="font-mono text-[10px] uppercase text-white/40">CKB · {event.entryFee} entry</p>
          </div>
        </header>

        <div className="relative z-10 mt-10 grid gap-8 lg:grid-cols-[1.35fr_0.65fr]">
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-poster text-2xl uppercase text-white">
                Squad · {players.length}/{event.maxPlayers}
              </h2>
              <span
                className={`inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-wider ${
                  ready ? 'text-[#99ee2d]' : 'text-white/50'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    ready ? 'animate-pulse bg-[#99ee2d]' : 'bg-white/30'
                  }`}
                />
                {ready ? 'Match ready' : `Need ${need} more`}
              </span>
            </div>

            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {slots.map((p, i) => {
                const isYou =
                  p &&
                  address &&
                  p.address.toLowerCase() === address.toLowerCase();
                const isHostSeat =
                  p && p.address.toLowerCase() === event.hostAddress.toLowerCase();
                if (!p) {
                  return (
                    <li
                      key={`open-${i}`}
                      className="flex min-h-[5.5rem] flex-col justify-center border border-dashed border-white/20 bg-black/25 px-4 py-4"
                    >
                      <span className="font-mono text-[10px] font-bold uppercase text-white/35">
                        Slot {i + 1}
                      </span>
                      <span className="mt-2 font-poster text-xl uppercase text-white/25">
                        Open
                      </span>
                    </li>
                  );
                }
                return (
                  <li
                    key={p.id}
                    className={`relative flex min-h-[5.5rem] items-center gap-3 border px-4 py-4 transition ${
                      isYou
                        ? 'border-[#99ee2d] bg-[#99ee2d]/10'
                        : 'border-white/12 bg-black/45'
                    }`}
                  >
                    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center border border-white/20 bg-white/5 font-poster text-lg uppercase text-white">
                      {p.displayName.slice(0, 1)}
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-[#0c0c12] bg-[#99ee2d]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-poster text-xl uppercase text-white">
                        {p.displayName}
                        {isYou ? ' · you' : ''}
                      </span>
                      <span className="mt-1 block font-mono text-[10px] uppercase text-white/45">
                        {isHostSeat ? 'Host' : 'Player'} · {p.stake} CKB locked
                      </span>
                    </span>
                    <span className="font-mono text-[11px] font-bold text-white/35">
                      #{i + 1}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <aside className="space-y-4">
            <div className="border border-white/10 bg-black/50 p-5 backdrop-blur-md">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
                {startMs > 0 ? 'Starts in' : ready ? 'Can drop now' : 'Waiting on squad'}
              </p>
              <p
                className={`mt-2 font-poster text-6xl uppercase tabular-nums leading-none ${
                  startMs <= 60_000 && startMs > 0 ? 'animate-pulse text-[#99ee2d]' : 'text-white'
                }`}
              >
                {startMs > 0 ? formatCountdown(startMs) : 'GO'}
              </p>

              <div className="mt-5 h-1.5 overflow-hidden bg-white/10">
                <div
                  className="h-full bg-[#99ee2d] transition-[width] duration-500"
                  style={{ width: `${fillPct}%` }}
                />
              </div>
              <p className="mt-2 font-mono text-[10px] uppercase text-white/40">
                Min {event.minPlayers} · {event.playerCount} seated · turn {event.turnSecs}s
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <InviteButton
                variant="arena"
                url={`/events/${eventId}`}
                title={`${event.name} — Keepers Relay`}
                text={`🔥 You're invited to ${event.name}. Entry ${event.entryFee} CKB · pot ${event.pot} CKB. Join the lobby:`}
              />

              {isHost ? (
                <button
                  type="button"
                  disabled={start.isPending || !ready}
                  onClick={() => address && start.mutate({ eventId, address })}
                  className="arena-cta w-full px-5 py-4 text-sm font-bold uppercase tracking-wide disabled:opacity-40"
                >
                  {start.isPending
                    ? 'Dropping match…'
                    : ready
                      ? 'Start match'
                      : `Need ${need} more players`}
                </button>
              ) : iAmIn ? (
                <p className="border border-white/10 bg-black/40 px-4 py-3 text-xs text-white/55">
                  {ready
                    ? 'Squad locked. Waiting on host to drop the match…'
                    : 'You’re in. Invite friends so the lobby can fill.'}
                </p>
              ) : (
                <ArenaCta href={`/events/${eventId}`}>Join this event</ArenaCta>
              )}

              {start.error ? (
                <p className="text-sm text-[#99ee2d]">{start.error.message}</p>
              ) : null}
            </div>

            <p className="font-mono text-[10px] uppercase leading-relaxed text-white/35">
              Live loop: take turn → challenge → mark → pass. Everyone watches even when it
              isn’t their turn.
            </p>
          </aside>
        </div>
      </div>
    </ArenaStage>
  );
}
