'use client';

import { useEffect, useState } from 'react';
import { Gamepad2, Plus } from 'lucide-react';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { ChainLoader } from '@/components/arena/ChainLoader';
import { CrownCard } from '@/components/crown/CrownCard';
import { Button } from '@/components/ui/Button';
import { EmptyState, PageTitle, Tabs } from '@/components/ui/kit';
import { fetchCrownList } from '@/lib/crown/remote';
import { listCrowns, type CrownRoom } from '@/lib/crown/rooms';

type Filter = 'live' | 'lobby' | 'finished' | 'all';

const FILTERS: { id: Filter; label: string; empty: string }[] = [
  { id: 'live', label: 'Live', empty: 'No game is running right now. Host one to start.' },
  { id: 'lobby', label: 'Lobby', empty: 'No lobbies are waiting for players right now.' },
  { id: 'finished', label: 'Finished', empty: 'No finished games yet.' },
  { id: 'all', label: 'All', empty: 'No games yet. Host one to start.' },
];

/** Live means the clock is still running; a game whose time is up counts as finished. */
function stageOf(room: CrownRoom, now: number): Exclude<Filter, 'all'> {
  if (room.status === 'lobby') return 'lobby';
  if (room.status === 'live' && (room.deadlineAt == null || room.deadlineAt > now)) return 'live';
  return 'finished';
}

export function CrownsLobby() {
  // null until the first read finishes, so the page never says "nothing here" while it is still looking.
  const [rooms, setRooms] = useState<CrownRoom[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  // The time of the last list read, so live and finished are judged without reading the clock while drawing.
  const [listedAt, setListedAt] = useState(0);
  // null until the player picks a tab: then Live if anything is live, otherwise All.
  const [chosen, setChosen] = useState<Filter | null>(null);

  useEffect(() => {
    let stop = false;
    const read = async () => {
      const local = listCrowns();
      const remote = await fetchCrownList().catch(() => null);
      if (stop) return;
      setListFailed(remote == null);
      // Without the shared list, keep what is on screen. This browser's own copies can be crowns that no longer exist.
      if (remote == null) {
        setRooms((current) => current ?? []);
        return;
      }
      // The shared list decides which crowns exist.
      const byId = new Map(remote.map((room) => [room.id, room]));
      for (const room of local) {
        const shared = byId.get(room.id);
        if (shared) byId.set(room.id, { ...room, status: shared.status, potShannons: shared.potShannons, king: shared.king });
      }
      setRooms([...byId.values()]);
      setListedAt(Date.now());
    };
    void read();
    // Refresh the list every 15 seconds while the tab is visible.
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

  const counts = { live: 0, lobby: 0, finished: 0, all: rooms?.length ?? 0 };
  for (const room of rooms ?? []) counts[stageOf(room, listedAt)] += 1;
  const filter: Filter = chosen ?? (counts.live > 0 ? 'live' : 'all');
  const shown = (rooms ?? []).filter((room) => filter === 'all' || stageOf(room, listedAt) === filter);

  return (
    <ArenaStage>
      <PageTitle
        eyebrow="Crowns"
        title={<span className="text-lime">Find a crown</span>}
        intro="Beat the score to take it. Hold it at zero to win the pot."
        action={
          <div className="flex flex-wrap gap-3">
            <Button variant="ghost" href="/practice">
              <Gamepad2 className="h-4 w-4" aria-hidden="true" /> Practice for free
            </Button>
            <Button href="/create">
              <Plus className="h-4 w-4" aria-hidden="true" /> Host a crown
            </Button>
          </div>
        }
      />

      {rooms != null && rooms.length > 0 ? (
        <div className="mt-8">
          <Tabs label="Filter crowns" tone="lime" value={filter} onChange={setChosen} options={FILTERS.map((item) => ({ id: item.id, label: item.label, count: counts[item.id] }))} />
        </div>
      ) : null}

      <div className="mt-6">
        {rooms == null ? (
          <ChainLoader compact title="Loading games…" />
        ) : rooms.length === 0 ? (
          <EmptyState
            title="Quiet right now"
            body={listFailed ? 'Could not load the games. Retrying…' : 'Everyone is warming up. Open your own crown and get it started.'}
            action={<Button href="/create">Host a crown</Button>}
          />
        ) : shown.length === 0 ? (
          <EmptyState
            title="Nothing here"
            body={FILTERS.find((item) => item.id === filter)?.empty ?? ''}
            action={
              <Button onClick={() => setChosen('all')} variant="ghost">
                Show all games
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((room) => (
              <li key={room.id} className="flex">
                <div className="w-full">
                  <CrownCard room={room} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ArenaStage>
  );
}
