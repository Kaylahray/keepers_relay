'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { ArenaRailCard, ArenaStage } from '@/components/arena/ArenaStage';
import { CrownCard } from '@/components/crown/CrownCard';
import { LaneArt } from '@/components/game/LaneArt';
import { arenaCoverForSeed } from '@/lib/poster';
import { fetchCrownList, publishCrown } from '@/lib/crown/remote';
import { ckbWhole, FLOOR_CROWN, listCrowns, saveCrown, sealCrown, type CrownRoom } from '@/lib/crown/rooms';
import { useWallet } from '@/hooks/useWallet';
import { useUsername } from '@/hooks/useUsername';
import { registryConfigured } from '@/lib/registry/config';

function crownHref(room: CrownRoom) {
  return `/play/${room.id}`;
}

function crownMeta(room: CrownRoom) {
  return `${ckbWhole(room.potShannons)} CKB prize · ${room.king ?? 'no crown holder yet'}`;
}

type Filter = 'live' | 'lobby' | 'finished' | 'all';

const FILTERS: { id: Filter; label: string; empty: string }[] = [
  { id: 'live', label: 'Live', empty: 'No game is running right now. Start one, or play a quick game.' },
  { id: 'lobby', label: 'Lobbies', empty: 'No lobbies are waiting for players right now.' },
  { id: 'finished', label: 'Finished', empty: 'No finished games yet.' },
  { id: 'all', label: 'All', empty: 'No games yet. Start one, or play a quick game.' },
];

/** Live means the clock is still running; a game whose time is up counts as finished. */
function stageOf(room: CrownRoom, now: number): Exclude<Filter, 'all'> {
  if (room.status === 'lobby') return 'lobby';
  if (room.status === 'live' && (room.deadlineAt == null || room.deadlineAt > now)) return 'live';
  return 'finished';
}

export function CrownsLobby() {
  const router = useRouter();
  const { isConnected, address } = useWallet();
  const { username: onChainUsername } = useUsername();
  // null until the first read finishes, so the page never says "nothing here" while it is still looking.
  const [rooms, setRooms] = useState<CrownRoom[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [openingFloor, setOpeningFloor] = useState(false);
  // The time of the last list read, so live and finished are judged without reading the clock while drawing.
  const [listedAt, setListedAt] = useState(0);
  // null until the player picks a tab: then Live if anything is live, otherwise All.
  const [chosen, setChosen] = useState<Filter | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const read = async () => {
      const local = listCrowns();
      const remote = await fetchCrownList().catch(() => null);
      if (stop) return;
      setListFailed(remote == null);
      const byId = new Map((remote ?? []).map((room) => [room.id, room]));
      for (const room of local) {
        const shared = byId.get(room.id);
        byId.set(
          room.id,
          shared
            ? { ...room, status: shared.status, potShannons: shared.potShannons, king: shared.king }
            : room,
        );
      }
      setRooms([...byId.values()]);
      setListedAt(Date.now());
    };
    void read();
    // A list of lobbies is not a live clock. Polling it every three seconds filled the
    // network tab with requests nobody was waiting on.
    const poll = window.setInterval(() => {
      if (document.hidden) return;
      void read();
    }, 15_000);
    const onVisible = () => {
      if (!document.hidden) void read();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop = true;
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const rail = (rooms ?? []).slice(0, 4);
  const counts = { live: 0, lobby: 0, finished: 0, all: rooms?.length ?? 0 };
  for (const room of rooms ?? []) counts[stageOf(room, listedAt)] += 1;
  const filter: Filter = chosen ?? (counts.live > 0 ? 'live' : 'all');
  const shown = (rooms ?? []).filter((room) => filter === 'all' || stageOf(room, listedAt) === filter);

  return (
    <ArenaStage>
      <section className="grid items-end gap-8 lg:grid-cols-[1fr_auto_minmax(260px,320px)] lg:gap-0">
        <div className="relative z-10 max-w-xl pb-6">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
            Crowns
          </p>
          <h1 className="mt-3 font-poster text-[clamp(2.75rem,6vw,4.5rem)] uppercase leading-[0.92] text-white">
            Crowns
          </h1>
          <p className="mt-4 max-w-md text-base font-light leading-relaxed text-white/60">
            Beat the score to take the crown. Hold it at zero to win the pot.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ArenaCta href="/create">Start a game</ArenaCta>
            <button
              type="button"
              onClick={() => {
                if (!isConnected || !address) {
                  setShareError('Connect your wallet from the header first.');
                  return;
                }
                if (registryConfigured() && !onChainUsername?.username) {
                  router.push('/join?next=/play');
                  return;
                }
                const room = {
                  ...sealCrown(FLOOR_CROWN),
                  hostAddress: address.toLowerCase(),
                };
                saveCrown(room);
                setShareError(null);
                setOpeningFloor(true);
                void publishCrown(room, room.hostAddress)
                  .then(() => router.push(`/play/${room.id}`))
                  .catch((error: unknown) => {
                    setShareError(error instanceof Error ? error.message : 'The lobby could not be saved.');
                    setOpeningFloor(false);
                  });
              }}
              disabled={openingFloor}
              className="border-b border-[#bef970] pb-1 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-50"
            >
              {openingFloor ? 'Opening a quick game…' : 'Quick game →'}
            </button>
          </div>
          {shareError ? <p className="mt-4 text-sm text-[#af2a3a]">{shareError}</p> : null}
        </div>

        <div className="relative mx-auto hidden h-[min(52vh,480px)] w-[280px] shrink-0 lg:block xl:w-[320px]">
          <div
            className="pointer-events-none absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-[#a855f7]/35 blur-[80px]"
            aria-hidden
          />
          <LaneArt shape="tall" className="relative z-10 h-full w-full border border-white/10" />
        </div>

        <aside className="relative z-10 border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div
            className="pointer-events-none absolute left-0 top-8 hidden h-[70%] w-px bg-gradient-to-b from-[#99ee2d] via-[#a855f7] to-transparent lg:block"
            aria-hidden
          />
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#99ee2d]">
            Crowns
          </p>
          <ul className="mt-4 space-y-2.5">
            {rail.length === 0 ? (
              <li className="text-sm text-white/50">{rooms == null ? 'Loading…' : 'No games yet.'}</li>
            ) : (
              rail.map((room) => (
                <li key={room.id}>
                  <ArenaRailCard
                    href={crownHref(room)}
                    eyebrow={room.status}
                    title={room.title}
                    meta={crownMeta(room)}
                    cover={arenaCoverForSeed(room.id)}
                    cta={room.status === 'live' ? 'Play' : 'Enter'}
                  />
                </li>
              ))
            )}
          </ul>
        </aside>
      </section>

      <section className="relative z-10 mt-14">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-poster text-3xl uppercase text-white sm:text-4xl">Games</h2>
          {rooms != null && rooms.length > 0 ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Show games">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={filter === item.id}
                  onClick={() => setChosen(item.id)}
                  className={`border px-3 py-1.5 font-mono text-[11px] font-bold uppercase ${
                    filter === item.id
                      ? 'border-[#99ee2d] bg-[#99ee2d] text-[#111]'
                      : 'border-white/20 text-white/70 hover:border-white/50'
                  }`}
                >
                  {item.label} · {counts[item.id]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {rooms == null ? (
          <p className="flex items-center gap-2 text-sm text-white/55">
            <Loader2 className="h-4 w-4 animate-spin text-[#99ee2d]" />
            Loading games…
          </p>
        ) : rooms.length === 0 ? (
          <p className="text-sm text-white/55">
            {listFailed ? 'Could not load the games. Retrying…' : 'No games yet. Start one, or play a quick game.'}
          </p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-white/55">{FILTERS.find((item) => item.id === filter)?.empty}</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((room, index) => (
              <li key={room.id}>
                <CrownCard room={room} index={index} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </ArenaStage>
  );
}
