'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { InviteButton } from '@/components/InviteButton';
import { EventCellTimeline } from '@/components/arena/EventCellTimeline';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { useEventQuery, useEventResultsQuery } from '@/hooks/useEvents';
import { buildCellTimeline, EVENT_MODE_LABEL } from '@/types/event';

export function EventResultsView({ eventId }: { eventId: string }) {
  const { data, isLoading, error } = useEventResultsQuery(eventId);
  const live = useEventQuery(eventId);

  const timeline = useMemo(() => {
    const detail = live.data;
    if (!detail || !data) return [];
    return buildCellTimeline({
      eventId,
      createdAt: detail.event.createdAt,
      hostName: detail.event.hostName,
      status: detail.event.status,
      endAt: detail.event.endAt,
      players: detail.players,
      sponsors: detail.event.sponsors,
      history: data.history,
    });
  }, [data, live.data, eventId]);

  if (isLoading) {
    return (
      <ArenaStage backHref="/events" backLabel="Events">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </ArenaStage>
    );
  }

  if (error || !data) {
    return (
      <ArenaStage backHref="/events" backLabel="Events">
        <h1 className="font-poster text-4xl uppercase text-white">Missing</h1>
        <p className="mt-3 text-sm text-white/60">{error?.message}</p>
      </ArenaStage>
    );
  }

  const champ = data.rankings[0];

  return (
    <ArenaStage backHref="/events" backLabel="Events">
      <section className="grid items-start gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
            Match over · {EVENT_MODE_LABEL[data.event.mode] ?? data.event.mode}
          </p>
          <h1 className="mt-3 font-poster text-[clamp(2.4rem,5vw,3.75rem)] uppercase leading-[0.95] text-white">
            {data.event.name}
          </h1>

          {champ ? (
            <div className="mt-8 border border-[#99ee2d]/40 bg-[#99ee2d]/10 px-5 py-6">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#99ee2d]">
                Champion
              </p>
              <p className="mt-2 font-poster text-5xl uppercase text-white">{champ.displayName}</p>
              <p className="mt-2 font-mono text-xs uppercase text-white/55">
                {champ.score} pts
              </p>
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="border border-white/10 bg-black/40 px-4 py-4">
              <p className="font-mono text-[10px] uppercase text-white/40">Final pot</p>
              <p className="mt-1 font-poster text-3xl uppercase text-[#99ee2d]">
                {data.event.pot} CKB
              </p>
            </div>
            <div className="border border-white/10 bg-black/40 px-4 py-4 sm:col-span-2">
              <p className="font-mono text-[10px] uppercase text-white/40">Prize distribution</p>
              <ul className="mt-2 space-y-1">
                {data.rankings
                  .filter((r) => r.payout > 0)
                  .map((r) => (
                    <li
                      key={r.playerId}
                      className="flex justify-between font-mono text-[11px] uppercase text-white/70"
                    >
                      <span>
                        #{r.place} {r.displayName}
                      </span>
                      <span className="text-[#99ee2d]">{r.payout} CKB</span>
                    </li>
                  ))}
                {data.rankings.every((r) => r.payout <= 0) ? (
                  <li className="font-mono text-[11px] text-white/40">No payouts calculated</li>
                ) : null}
              </ul>
            </div>
          </div>

          <div className="mt-8 border border-white/10 bg-black/45 p-5 backdrop-blur-md">
            <h2 className="font-poster text-2xl uppercase text-white">Final standings</h2>
            <ul className="mt-4 space-y-2">
              {data.rankings.map((r) => (
                <li
                  key={r.playerId}
                  className={`flex flex-wrap items-center justify-between gap-2 border px-3 py-3 ${
                    r.place === 1
                      ? 'border-[#99ee2d]/50 bg-[#99ee2d]/5'
                      : 'border-white/10'
                  }`}
                >
                  <span className="font-bold uppercase text-white">
                    #{r.place} {r.displayName}
                  </span>
                  <span className="font-mono text-[11px] text-white/55">
                    {r.score} pts · {r.correctCount} correct · avg {r.avgMs}ms
                    {r.payout > 0 ? ` · ${r.payout} CKB` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <ArenaCta href="/create">Run it back</ArenaCta>
            <InviteButton
              variant="arena"
              url={`/events/${eventId}/results`}
              title={`${data.event.name} results`}
              text={`Match settled: ${champ?.displayName ?? 'winner'} took ${data.event.name}. Pot ${data.event.pot} CKB.`}
            />
            <Link
              href="/events"
              className="self-center border-b border-white/30 pb-1 text-[11px] font-bold uppercase text-white/70"
            >
              Browse events
            </Link>
          </div>
        </div>

        <aside>
          <EventCellTimeline items={timeline} title="Match timeline" />
        </aside>
      </section>
    </ArenaStage>
  );
}
