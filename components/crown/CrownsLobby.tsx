'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { ArenaRailCard, ArenaStage } from '@/components/arena/ArenaStage';
import { CrownCard } from '@/components/crown/CrownCard';
import { arenaCoverForSeed } from '@/lib/poster';
import { fetchCrownList, publishCrown } from '@/lib/crown/remote';
import { ckbWhole, listCrowns, saveCrown, sealFloorCrown, type CrownRoom } from '@/lib/crown/rooms';
import { useWallet } from '@/hooks/useWallet';
import { useUsername } from '@/hooks/useUsername';
import { registryConfigured } from '@/lib/registry/config';

function crownHref(room: CrownRoom) {
  return `/play/${room.id}`;
}

function crownMeta(room: CrownRoom) {
  return `${ckbWhole(room.potShannons)} CKB pot · ${room.king ?? 'Open seat'}`;
}

export function CrownsLobby() {
  const router = useRouter();
  const { isConnected, address } = useWallet();
  const { username: onChainUsername } = useUsername();
  const [rooms, setRooms] = useState<CrownRoom[]>([]);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const read = async () => {
      const local = listCrowns();
      const remote = await fetchCrownList().catch(() => null);
      if (stop) return;
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

  const rail = rooms.slice(0, 4);

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
            A host seals a bank. Players steal the crown by answering. The clock on screen is a
            prediction. The chain timestamp pays the pot.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ArenaCta href="/create">Open a crown</ArenaCta>
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
                  ...sealFloorCrown(),
                  hostAddress: address.toLowerCase(),
                };
                saveCrown(room);
                setShareError(null);
                void publishCrown(room, room.hostAddress)
                  .then(() => router.push(`/play/${room.id}`))
                  .catch((error: unknown) => {
                    setShareError(error instanceof Error ? error.message : 'The lobby could not be saved.');
                  });
              }}
              className="border-b border-[#bef970] pb-1 text-sm font-bold uppercase tracking-wide text-white"
            >
              Play the floor →
            </button>
          </div>
          {shareError ? <p className="mt-4 text-sm text-[#af2a3a]">{shareError}</p> : null}
        </div>

        <div className="relative mx-auto hidden h-[min(52vh,480px)] w-[280px] shrink-0 lg:block xl:w-[320px]">
          <div
            className="pointer-events-none absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-[#a855f7]/35 blur-[80px]"
            aria-hidden
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/uismod/organizer.png"
            alt=""
            className="relative z-10 h-full w-full object-contain object-bottom drop-shadow-[0_0_40px_rgba(168,85,247,0.45)]"
          />
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
              <li className="text-sm text-white/50">No crowns yet.</li>
            ) : (
              rail.map((room) => (
                <li key={room.id}>
                  <ArenaRailCard
                    href={crownHref(room)}
                    eyebrow={room.status}
                    title={room.title}
                    meta={crownMeta(room)}
                    cover={arenaCoverForSeed(room.title)}
                    cta={room.status === 'live' ? 'Play' : 'Enter'}
                  />
                </li>
              ))
            )}
          </ul>
        </aside>
      </section>

      <section className="relative z-10 mt-14">
        <h2 className="mb-6 font-poster text-3xl uppercase text-white sm:text-4xl">All crowns</h2>
        {rooms.length === 0 ? (
          <p className="text-sm text-white/55">Nothing here yet. Open one, or play the floor.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rooms.map((room, index) => (
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
