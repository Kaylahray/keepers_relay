'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { EventRulesStrip } from '@/components/arena/EventRulesStrip';
import {
  useAnswerEvent,
  useEventQuery,
  useHolderQuestion,
  useTimeoutEvent,
} from '@/hooks/useEvents';
import { useWallet } from '@/hooks/useWallet';
import type { EventPlayer } from '@/types/event';

function nextAfter(
  players: EventPlayer[],
  currentId: string | undefined,
): EventPlayer | null {
  const alive = players.filter((p) => p.status !== 'eliminated');
  if (!currentId || alive.length === 0) return null;
  const idx = alive.findIndex((p) => p.id === currentId);
  if (idx < 0) return alive[0] ?? null;
  return alive[(idx + 1) % alive.length] ?? null;
}

function placeLabel(place: number): string {
  return `#${place + 1}`;
}

/** Live arena — your turn OR high-tension spectator view + auto-timeout. */
export function LiveEventView({
  eventId,
  spectate = false,
}: {
  eventId: string;
  spectate?: boolean;
}) {
  const router = useRouter();
  const { address, isConnected, connect } = useWallet();
  const { data, isLoading } = useEventQuery(eventId);
  const questionQ = useHolderQuestion(eventId, address);
  const answer = useAnswerEvent(eventId);
  const timeout = useTimeoutEvent(eventId);
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [potFlash, setPotFlash] = useState<string | null>(null);
  const [displayPot, setDisplayPot] = useState(0);
  const lastPot = useRef<number | null>(null);
  const timeoutSentFor = useRef<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (data?.event.status === 'settled' || data?.event.status === 'finished') {
      router.replace(`/events/${eventId}/results`);
    }
  }, [data?.event.status, eventId, router]);

  useEffect(() => {
    setSelected(null);
    setFlash(null);
    timeoutSentFor.current = null;
  }, [data?.currentTurn?.id]);

  useEffect(() => {
    const pot = data?.event.pot;
    if (pot == null) return;
    if (lastPot.current != null && pot > lastPot.current) {
      const delta = pot - lastPot.current;
      setPotFlash(`+${delta} CKB`);
      lastPot.current = pot;
      setDisplayPot(pot);
      const clear = window.setTimeout(() => setPotFlash(null), 1800);
      return () => window.clearTimeout(clear);
    }
    lastPot.current = pot;
    setDisplayPot(pot);
  }, [data?.event.pot]);

  const remaining = data?.currentTurn
    ? Math.max(0, Math.ceil((new Date(data.currentTurn.deadlineAt).getTime() - now) / 1000))
    : 0;

  /** Auto-timeout: client only detects; server is authoritative. */
  useEffect(() => {
    if (!data || data.event.status !== 'live') return;
    const turn = data.currentTurn;
    if (!turn || turn.state !== 'pending') return;
    if (remaining > 0) return;
    if (timeout.isPending) return;
    if (timeoutSentFor.current === turn.id) return;
    timeoutSentFor.current = turn.id;
    timeout.mutate(
      { eventId, address },
      {
        onSuccess: (res) => {
          setFlash({
            ok: false,
            text: `Timeout · ${res.holderName} · baton passes`,
          });
          if (res.settled) router.push(`/events/${eventId}/results`);
        },
        onError: () => {
          timeoutSentFor.current = null;
        },
      },
    );
  }, [remaining, data, eventId, address, timeout, router]);

  const ranked = useMemo(() => {
    if (!data) return [];
    return [...data.players].sort(
      (a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName),
    );
  }, [data]);

  if (isLoading || !data) {
    return (
      <ArenaStage backHref={`/events/${eventId}`} backLabel="Event">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </ArenaStage>
    );
  }

  const { event, players, currentTurn, history } = data;
  const holder = players.find((p) => p.id === currentTurn?.currentPlayerId);
  const nextPlayer = nextAfter(players, currentTurn?.currentPlayerId);
  const isHolder =
    !spectate &&
    Boolean(
      address &&
        holder &&
        holder.address.toLowerCase() === address.toLowerCase(),
    );
  const iAmNext = Boolean(
    address &&
      nextPlayer &&
      nextPlayer.address.toLowerCase() === address.toLowerCase() &&
      !isHolder,
  );
  const question = isHolder ? questionQ.data?.question : null;
  const turnBudget = event.turnSecs || 15;
  const clockPct = turnBudget > 0 ? Math.min(100, (remaining / turnBudget) * 100) : 0;
  const urgent = remaining <= 5;
  const pressure = remaining <= 10 && remaining > 5;
  const stillIn = players.filter((p) => p.status !== 'eliminated').length;
  const clutch =
    stillIn <= 3 || (ranked[0] && ranked[1] && ranked[0].score - ranked[1].score <= 1);
  const recent = [...history].slice(-6).reverse();
  const moveNumber = history.length + (currentTurn ? 1 : 0);

  if (!isConnected && !spectate) {
    return (
      <ArenaStage backHref={`/events/${eventId}`} backLabel="Event">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#99ee2d]">
          Live match
        </p>
        <h1 className="mt-3 font-poster text-4xl uppercase text-white">{event.name}</h1>
        <ArenaCta onClick={() => connect()} className="mt-8">
          Connect to play
        </ArenaCta>
      </ArenaStage>
    );
  }

  return (
    <ArenaStage backHref={`/events/${eventId}`} backLabel="Event">
      <div className="relative">
        <div
          className="pointer-events-none absolute right-0 top-0 h-56 w-56 rounded-full bg-[#99ee2d]/10 blur-[80px]"
          aria-hidden
        />

        {iAmNext ? (
          <div className="mb-6 animate-pulse border border-[#99ee2d] bg-[#99ee2d]/15 px-4 py-3 text-center">
            <p className="font-poster text-2xl uppercase tracking-wide text-[#99ee2d]">
              You’re next
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase text-white/60">
              {holder?.displayName ?? 'Current player'} is making the move that keeps the game alive
            </p>
          </div>
        ) : null}

        {clutch && event.status === 'live' ? (
          <p className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-[#ff56f6]">
            Clutch · {stillIn} still in · move #{moveNumber}
          </p>
        ) : null}

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
              {spectate ? 'Spectating' : isHolder ? 'Your move' : 'Live match'} · Round{' '}
              {currentTurn?.round ?? '—'} · Move #{moveNumber}
            </p>
            <h1 className="mt-2 font-poster text-[clamp(2rem,4.5vw,3.25rem)] uppercase leading-[0.95] text-white">
              {event.name}
            </h1>
            <div className="mt-3">
              <EventRulesStrip
                playRules={event.playRules}
                turnSecs={event.turnSecs}
                questionSource={event.questionSource}
                winnersCount={event.winnersCount}
              />
            </div>
          </div>
          <div className="relative min-w-[9rem] text-right">
            <p className="font-mono text-[10px] uppercase text-white/45">Pot</p>
            <p
              className={`font-poster text-4xl uppercase text-[#99ee2d] transition-transform ${
                potFlash ? 'scale-110' : 'scale-100'
              }`}
            >
              {displayPot || event.pot} CKB
            </p>
            {potFlash ? (
              <p className="absolute -left-2 top-0 animate-pulse font-mono text-sm font-bold text-[#99ee2d]">
                {potFlash}
              </p>
            ) : null}
          </div>
        </header>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <section
            className={`border bg-black/50 p-5 backdrop-blur-md sm:p-6 ${
              urgent
                ? 'border-[#99ee2d] shadow-[0_0_40px_rgba(153,238,45,0.12)]'
                : pressure
                  ? 'border-[#ff56f6]/40'
                  : 'border-white/10'
            }`}
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-white/45">
                  Current move
                </p>
                <h2
                  className={`mt-1 font-poster text-4xl uppercase ${
                    isHolder ? 'text-[#99ee2d]' : 'text-white'
                  }`}
                >
                  {holder?.displayName ?? '—'}
                  {isHolder ? ' · you' : ''}
                </h2>
                <p className="mt-2 max-w-sm text-sm text-white/50">
                  {isHolder
                    ? 'Answer to score, grow the pot, and reset the clock.'
                    : `${holder?.displayName ?? 'Player'} is answering — this move keeps the game alive.`}
                </p>
                {nextPlayer ? (
                  <p className="mt-2 font-mono text-[10px] uppercase text-white/40">
                    On deck · {nextPlayer.displayName}
                  </p>
                ) : null}
              </div>
              <div className="min-w-[7rem] text-right">
                <p className="font-mono text-[10px] font-bold uppercase text-white/45">Clock</p>
                <p
                  className={`font-poster text-6xl tabular-nums leading-none ${
                    urgent ? 'animate-pulse text-[#99ee2d]' : pressure ? 'text-[#ff56f6]' : 'text-white'
                  }`}
                >
                  {remaining}
                  <span className="text-2xl text-white/40">s</span>
                </p>
              </div>
            </div>

            <div className="mt-4 h-1.5 overflow-hidden bg-white/10">
              <div
                className={`h-full transition-[width] duration-200 ${
                  urgent ? 'bg-[#99ee2d]' : pressure ? 'bg-[#ff56f6]' : 'bg-white/70'
                }`}
                style={{ width: `${clockPct}%` }}
              />
            </div>

            {event.status !== 'live' ? (
              <p className="mt-8 text-sm text-white/55">Match not live yet — hop back to the lobby.</p>
            ) : isHolder && question && remaining > 0 ? (
              <div className="mt-8">
                <p className="font-mono text-[10px] font-bold uppercase text-[#99ee2d]">
                  Challenge · {question.category} · {question.difficulty}
                </p>
                <p className="mt-3 text-xl font-medium leading-snug text-white sm:text-2xl">
                  {question.prompt}
                </p>
                <div className="mt-5 grid gap-2">
                  {question.options.map((opt, i) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setSelected(i)}
                      className={`border px-4 py-3.5 text-left text-sm font-medium transition sm:text-base ${
                        selected === i
                          ? 'border-[#99ee2d] bg-[#99ee2d]/15 text-white'
                          : 'border-white/15 bg-black/30 text-white/80 hover:border-white/35'
                      }`}
                    >
                      <span className="mr-3 font-mono text-[10px] text-white/35">
                        {String.fromCharCode(65 + i)}
                      </span>
                      {opt}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={selected === null || answer.isPending}
                  onClick={() => {
                    if (selected === null || !address) return;
                    answer.mutate(
                      { eventId, address, selectedIndex: selected },
                      {
                        onSuccess: (res) => {
                          setFlash({
                            ok: res.correct,
                            text: res.correct
                              ? 'Hit — pot / clock update · baton passes'
                              : 'Miss — baton still passes',
                          });
                          setSelected(null);
                          if (res.settled) router.push(`/events/${eventId}/results`);
                        },
                      },
                    );
                  }}
                  className="arena-cta mt-5 w-full px-4 py-4 text-sm font-bold uppercase disabled:opacity-40"
                >
                  {answer.isPending ? 'Sealing…' : 'Lock answer · pass'}
                </button>
              </div>
            ) : (
              <div className="mt-8 border border-white/10 bg-black/35 p-6">
                <p className="font-poster text-3xl uppercase leading-none text-white">
                  {remaining <= 0
                    ? timeout.isPending
                      ? 'Timeout — advancing…'
                      : 'Clock expired'
                    : isHolder
                      ? 'Loading your challenge…'
                      : `${holder?.displayName ?? 'Player'} is answering`}
                </p>
                <p className="mt-3 max-w-md text-sm text-white/55">
                  {remaining <= 0
                    ? 'Server marks the turn expired. No one has to click Pass.'
                    : iAmNext
                      ? 'If they miss or the clock dies, you’re up.'
                      : 'Watch the clock and the pot. Waiting is gameplay.'}
                </p>
              </div>
            )}

            {flash ? (
              <p
                className={`mt-4 text-sm font-medium ${
                  flash.ok ? 'text-[#99ee2d]' : 'text-[#ff56f6]'
                }`}
              >
                {flash.text}
              </p>
            ) : null}
            {answer.error ? (
              <p className="mt-2 text-sm text-[#99ee2d]">{answer.error.message}</p>
            ) : null}
          </section>

          <aside className="space-y-4">
            <section className="border border-white/10 bg-black/50 p-4 backdrop-blur-md">
              <h3 className="font-poster text-xl uppercase text-white">Standings</h3>
              <ul className="mt-3 space-y-1.5">
                {ranked.map((p, i) => {
                  const active = p.id === holder?.id;
                  const you =
                    address && p.address.toLowerCase() === address.toLowerCase();
                  return (
                    <li
                      key={p.id}
                      className={`flex items-center justify-between gap-2 px-2 py-2 text-sm ${
                        active
                          ? 'border border-[#99ee2d]/50 bg-[#99ee2d]/10'
                          : 'border border-transparent'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-7 shrink-0 font-mono text-[11px] font-bold text-white/40">
                          {placeLabel(i)}
                        </span>
                        <span
                          className={`truncate font-bold uppercase ${
                            active ? 'text-[#99ee2d]' : 'text-white'
                          }`}
                        >
                          {p.displayName}
                          {you ? ' · you' : ''}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-white/55">
                        {p.score} pts
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="border border-white/10 bg-black/50 p-4 backdrop-blur-md">
              <h3 className="font-poster text-xl uppercase text-white">Feed</h3>
              {recent.length === 0 ? (
                <p className="mt-3 font-mono text-[10px] uppercase text-white/35">
                  Moves land here as the baton moves.
                </p>
              ) : (
                <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                  {recent.map((h) => (
                    <li
                      key={h.id}
                      className="border-b border-white/5 pb-2 font-mono text-[10px] uppercase last:border-0"
                    >
                      <span className="text-white/80">
                        R{h.round} · {h.displayName}
                      </span>
                      <span
                        className={`ml-2 ${
                          h.timedOut
                            ? 'text-white/40'
                            : h.correct
                              ? 'text-[#99ee2d]'
                              : 'text-[#ff56f6]'
                        }`}
                      >
                        {h.timedOut ? 'timeout' : h.correct ? 'hit' : 'miss'}
                        {h.scoreDelta > 0 ? ` · +${h.scoreDelta}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </ArenaStage>
  );
}
