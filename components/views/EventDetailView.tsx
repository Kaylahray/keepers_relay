'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { InviteButton } from '@/components/InviteButton';
import { EventCellTimeline } from '@/components/arena/EventCellTimeline';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { EventRulesStrip } from '@/components/arena/EventRulesStrip';
import {
  useEventQuery,
  useJoinEvent,
  useSponsorEvent,
  useStartEvent,
} from '@/hooks/useEvents';
import { useWallet } from '@/hooks/useWallet';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useUsername } from '@/hooks/useUsername';
import { buildCellTimeline, EVENT_MODE_LABEL } from '@/types/event';
import { resolveCover } from '@/lib/poster';
import { eventCellsLive } from '@/lib/relay/ckb';

const LIFECYCLE = ['registration', 'ready', 'live', 'finished', 'settled'] as const;

export function EventDetailView({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { data, isLoading, error } = useEventQuery(eventId);
  const { address, isConnected, connect } = useWallet();
  const me = useMyBuilder().data?.builder;
  const { username } = useUsername();
  const join = useJoinEvent(eventId);
  const start = useStartEvent(eventId);
  const sponsor = useSponsorEvent(eventId);

  const timeline = useMemo(() => {
    if (!data) return [];
    return buildCellTimeline({
      eventId,
      createdAt: data.event.createdAt,
      hostName: data.event.hostName,
      status: data.event.status,
      endAt: data.event.endAt,
      players: data.players,
      sponsors: data.event.sponsors,
      history: data.history,
    });
  }, [data, eventId]);

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
        <h1 className="font-poster text-4xl uppercase text-white">Not found</h1>
        <p className="mt-3 text-sm text-white/60">{error?.message ?? 'Missing event.'}</p>
      </ArenaStage>
    );
  }

  const { event, players, currentTurn } = data;
  const isHost =
    address && event.hostAddress.toLowerCase() === address.toLowerCase();
  const joined = Boolean(
    address && players.some((p) => p.address.toLowerCase() === address.toLowerCase()),
  );
  const displayName =
    me?.displayName || username?.username || me?.username || 'Keeper';
  const cover = resolveCover(event.coverImageUrl, event.name);
  const statusIdx = Math.max(
    0,
    LIFECYCLE.indexOf(event.status as (typeof LIFECYCLE)[number]),
  );
  const stakeSum = players.reduce((s, p) => s + p.stake, 0);
  const sponsorSum = event.sponsors.reduce((s, sp) => s + sp.amount, 0);

  return (
    <ArenaStage backHref="/events" backLabel="Events">
      <section className="grid items-start gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
            {event.rulesSummary ?? event.modeLabel ?? EVENT_MODE_LABEL[event.mode]} ·{' '}
            {event.category}
          </p>
          <h1 className="mt-3 font-poster text-[clamp(2.4rem,5vw,3.75rem)] uppercase leading-[0.95] text-white">
            {event.name}
          </h1>
          {event.eventCellId ? (
            <p className="mt-2 font-mono text-[10px] text-white/45">
              On-chain ·{' '}
              <a
                href={`https://pudge.explorer.nervos.org/transaction/${event.createTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-[#99ee2d] underline-offset-2 hover:underline"
              >
                {event.createTxHash?.slice(0, 10)}…
              </a>
            </p>
          ) : eventCellsLive() ? (
            <p className="mt-2 font-mono text-[10px] text-white/35">Off-chain lobby only</p>
          ) : null}
          {event.communityName && event.communitySlug ? (
            <p className="mt-2 text-sm text-white/55">
              Community ·{' '}
              <Link
                href={`/communities/${event.communitySlug}`}
                className="text-[#99ee2d] underline-offset-2 hover:underline"
              >
                {event.communityName}
              </Link>
            </p>
          ) : null}
          <p className="mt-4 max-w-xl text-base font-light leading-relaxed text-white/55">
            {event.description}
          </p>

          <div className="mt-6">
            <EventRulesStrip
              playRules={event.playRules}
              turnSecs={event.turnSecs}
              questionSource={event.questionSource}
              winnersCount={event.winnersCount}
            />
          </div>

          <ol className="mt-8 flex flex-wrap gap-2">
            {LIFECYCLE.map((step, i) => (
              <li
                key={step}
                className={`border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider ${
                  i <= statusIdx
                    ? 'border-[#99ee2d] bg-[#99ee2d]/15 text-[#99ee2d]'
                    : 'border-white/10 text-white/35'
                }`}
              >
                {step}
              </li>
            ))}
          </ol>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Pot', `${event.pot} CKB`],
              ['Entry', `${event.entryFee} CKB`],
              ['Players', `${event.playerCount}/${event.maxPlayers}`],
              ['Clock', `${event.turnSecs}s`],
            ].map(([label, value]) => (
              <div
                key={label}
                className="border border-white/10 bg-black/40 px-3 py-3 backdrop-blur-sm"
              >
                <p className="font-mono text-[9px] uppercase text-white/40">{label}</p>
                <p className="mt-1 font-poster text-xl uppercase text-white">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 font-mono text-[10px] text-white/40">
            Seed {event.startingPot} + stakes {stakeSum} + sponsors {sponsorSum} CKB
            {event.playRules?.growingPot ? ' · pot grows on valid moves' : ''}
          </p>

          <p className="mt-6 text-sm text-white/50">
            Host · <span className="text-white">{event.hostName}</span>
            {' · '}Topics · {event.topics.join(', ') || 'general'}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {!isConnected ? (
              <ArenaCta onClick={() => connect()}>Connect to join</ArenaCta>
            ) : event.status === 'live' ? (
              <ArenaCta href={`/events/${eventId}/live`}>Enter match</ArenaCta>
            ) : event.status === 'settled' || event.status === 'finished' ? (
              <ArenaCta href={`/events/${eventId}/results`}>View results</ArenaCta>
            ) : (
              <>
                {!joined ? (
                  <button
                    type="button"
                    disabled={join.isPending}
                    onClick={() =>
                      address &&
                      join.mutate(
                        { eventId, address, displayName },
                        {
                          onSuccess: () => router.push(`/events/${eventId}/waiting`),
                        },
                      )
                    }
                    className="arena-cta px-5 py-3.5 text-[15px] font-bold uppercase disabled:opacity-40"
                  >
                    {join.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : event.eventCellId && isHost ? (
                      `Join on-chain · ${event.entryFee} CKB`
                    ) : event.eventCellId && !isHost ? (
                      `Join lobby · ${event.entryFee} CKB`
                    ) : (
                      `Join lobby · ${event.entryFee} CKB`
                    )}
                  </button>
                ) : (
                  <ArenaCta href={`/events/${eventId}/waiting`}>Enter lobby</ArenaCta>
                )}
                {isHost ? (
                  <button
                    type="button"
                    disabled={start.isPending || event.playerCount < event.minPlayers}
                    onClick={() =>
                      address &&
                      start.mutate(
                        { eventId, address },
                        { onSuccess: () => router.push(`/events/${eventId}/live`) },
                      )
                    }
                    className="border border-[#99ee2d] px-4 py-3 text-xs font-bold uppercase text-[#99ee2d] disabled:opacity-40"
                  >
                    {start.isPending
                      ? 'Starting…'
                      : event.playerCount < event.minPlayers
                        ? `Need ${event.minPlayers} min`
                        : 'Start match'}
                  </button>
                ) : null}
              </>
            )}
            <InviteButton
              variant="arena"
              url={`/events/${eventId}`}
              title={`${event.name} — Keepers Relay`}
              text={`🔥 Challenge: ${event.name}. Entry ${event.entryFee} CKB · pot ${event.pot} CKB.`}
            />
            <Link
              href={`/events/${eventId}/watch`}
              className="self-center border-b border-[#bef970] pb-1 text-[11px] font-bold uppercase text-white"
            >
              Spectate
            </Link>
          </div>

          {(join.error || start.error) && (
            <p className="mt-3 text-sm font-bold text-[#99ee2d]">
              {join.error?.message ?? start.error?.message}
            </p>
          )}

          {event.allowSponsorship && event.status !== 'settled' ? (
            <button
              type="button"
              disabled={sponsor.isPending}
              onClick={() =>
                sponsor.mutate({
                  eventId,
                  sponsorName: displayName,
                  amount: 25,
                  note: 'Community boost',
                })
              }
              className="mt-6 border border-white/20 px-3 py-2 text-[10px] font-bold uppercase text-white/80"
            >
              Sponsor +25 CKB
            </button>
          ) : null}
        </div>

        <aside className="relative space-y-4">
          <div
            className="pointer-events-none absolute -right-4 top-8 h-56 w-56 rounded-full bg-[#a855f7]/25 blur-[80px]"
            aria-hidden
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt=""
            className="relative z-10 mx-auto max-h-[280px] w-full max-w-sm border border-white/10 bg-black/40 object-contain"
          />
          <div className="relative z-10 border border-white/10 bg-black/50 p-4 backdrop-blur-md">
            <p className="font-mono text-[10px] font-bold uppercase text-[#99ee2d]">
              Stakes ({players.length})
            </p>
            <ul className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
              {players.length === 0 ? (
                <li className="text-sm text-white/45">No stakes yet — each join is its own seat.</li>
              ) : (
                players.map((p) => (
                  <li
                    key={p.id}
                    className="flex justify-between border-b border-white/5 py-2 text-sm last:border-0"
                  >
                    <span className="font-bold uppercase text-white">{p.displayName}</span>
                    <span className="font-mono text-[10px] text-white/40">
                      {p.stake} CKB · {p.status}
                    </span>
                  </li>
                ))
              )}
            </ul>
            {currentTurn ? (
              <p className="mt-3 text-xs text-[#99ee2d]">
                Live turn · round {currentTurn.round}
              </p>
            ) : null}
            {event.sponsors.length > 0 ? (
              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="text-[10px] font-bold uppercase text-white/45">Sponsors</p>
                <ul className="mt-1 text-xs text-white/70">
                  {event.sponsors.map((s) => (
                    <li key={s.id}>
                      {s.name} · +{s.amount} CKB
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          {(event.status === 'live' ||
            event.status === 'finished' ||
            event.status === 'settled' ||
            players.length > 0) && (
            <div className="relative z-10">
              <EventCellTimeline items={timeline} compact />
            </div>
          )}
        </aside>
      </section>
    </ArenaStage>
  );
}
