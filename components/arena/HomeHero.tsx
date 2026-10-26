'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchCrownList } from '@/lib/crown/remote';
import { ckbWhole, GAMES, type CrownRoom } from '@/lib/crown/rooms';
import { HeroCharacter } from '@/components/arena/HeroCharacter';

const HERO_BLURB =
  'Beat the best score to grab the crown. Each grab grows the prize and shortens the clock. Hold it at zero to win.';

function clockFace(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Live crowns first, soonest deadline first, then lobbies waiting to start. */
function featured(rooms: CrownRoom[]): CrownRoom[] {
  const live = rooms
    .filter((room) => room.status === 'live' && room.deadlineAt != null && room.deadlineAt > Date.now())
    .sort((a, b) => (a.deadlineAt ?? 0) - (b.deadlineAt ?? 0));
  const lobbies = rooms.filter((room) => room.status === 'lobby');
  return [...live, ...lobbies].slice(0, 4);
}

export function HomeHero() {
  const [rooms, setRooms] = useState<CrownRoom[] | null>(null);
  const [active, setActive] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stop = false;
    const load = () => {
      if (document.hidden) return;
      fetchCrownList()
        .then((list) => {
          if (!stop) setRooms(featured(list));
        })
        .catch(() => {
          if (!stop) setRooms((current) => current ?? []);
        });
    };
    load();
    const poll = window.setInterval(load, 15_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      stop = true;
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, []);

  const list = rooms ?? [];
  const room = list[Math.min(active, Math.max(0, list.length - 1))] ?? null;

  return (
    <section className="relative isolate overflow-hidden bg-[#111]">
      {/* The whole hero is one 3D scene: the city, the crowned character, the light. Gradients keep the words readable. */}
      <HeroCharacter className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-0 bg-[#111]/55 xl:bg-transparent xl:bg-gradient-to-r xl:from-[#111]/90 xl:via-[#111]/35 xl:to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-b from-transparent to-[#111]" />

      <div className="relative mx-auto flex min-h-[560px] w-full max-w-[1440px] flex-col px-5 pb-16 pt-10 sm:px-10 sm:pt-12 xl:min-h-[620px] xl:pt-14">
        <div className="grid flex-1 grid-cols-1 items-center gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] xl:gap-6">
          <div className="relative z-10 max-w-xl xl:pb-8">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
              Live on CKB testnet
            </p>
            <h1 className="mt-3 font-poster text-[clamp(2.25rem,8vw,4.5rem)] uppercase leading-[0.92] text-white">
              <span className="block sm:whitespace-nowrap">Beat the score.</span>
              <span className="block sm:whitespace-nowrap">Take the crown.</span>
            </h1>
            <p className="mt-4 max-w-md text-sm font-light leading-relaxed text-white/80 sm:mt-5 sm:text-[15px] md:text-base">
              {HERO_BLURB}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                href="/play"
                className="arena-cta inline-flex h-12 items-center gap-2 pl-6 pr-10 font-poster text-base uppercase leading-none text-[#111]"
              >
                Find a crown
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/uismod/arrow-right.svg" alt="" className="size-5" />
              </Link>
              <Link href="/create" className="font-poster text-sm uppercase tracking-wide text-[#99ee2d]">
                Host one yourself
              </Link>
            </div>
          </div>


          <div className="relative z-20 w-full xl:self-center">
            <div className="border border-white/10 bg-[#111]/85 backdrop-blur-md [clip-path:polygon(0_0,100%_0,100%_92%,94%_100%,0_100%)]">
              {rooms == null ? (
                <div className="p-5">
                  <p className="font-mono text-[11px] uppercase text-white/45">Loading games…</p>
                </div>
              ) : room ? (
                <div className="p-5">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#99ee2d]">
                    {room.status === 'live' ? 'Live now' : 'Lobby open'} · {GAMES[room.game].title}
                  </p>
                  <p className="mt-2 truncate font-poster text-3xl uppercase leading-none text-white">{room.title}</p>
                  <dl className="mt-4 grid grid-cols-3 gap-3 font-mono text-[10px] uppercase text-white/45">
                    <div>
                      <dt>Prize</dt>
                      <dd className="mt-1 font-poster text-2xl leading-none text-[#99ee2d]">{ckbWhole(room.potShannons)}</dd>
                    </div>
                    <div>
                      <dt>To beat</dt>
                      <dd className="mt-1 font-poster text-2xl leading-none text-[#e1bf47]">{room.kingScore}</dd>
                    </div>
                    <div>
                      <dt>{room.status === 'live' ? 'Time left' : 'Entry fee'}</dt>
                      <dd className="mt-1 font-poster text-2xl leading-none text-white tabular-nums">
                        {room.status === 'live' && room.deadlineAt != null
                          ? clockFace(room.deadlineAt - now)
                          : `${ckbWhole(room.feeShannons)}`}
                      </dd>
                    </div>
                  </dl>
                  <Link
                    href={`/play/${room.id}`}
                    className="arena-cta mt-5 inline-flex h-11 w-full items-center justify-between px-5 font-poster text-base uppercase leading-none text-[#111]"
                  >
                    {room.status === 'live' ? 'Play this game' : 'Take a seat'}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/uismod/arrow-right.svg" alt="" className="size-5" />
                  </Link>
                </div>
              ) : (
                <div className="p-5">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#99ee2d]">No game running</p>
                  <p className="mt-2 font-poster text-3xl uppercase leading-none text-white">Open the first one</p>
                  <p className="mt-3 text-sm text-white/60">Pick a clock and an entry fee.</p>
                  <Link
                    href="/create"
                    className="arena-cta mt-5 inline-flex h-11 w-full items-center justify-between px-5 font-poster text-base uppercase leading-none text-[#111]"
                  >
                    Open a crown
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/uismod/arrow-right.svg" alt="" className="size-5" />
                  </Link>
                </div>
              )}
            </div>
            {list.length > 1 ? (
              <div className="mt-3 flex items-center gap-2" role="tablist" aria-label="Crowns">
                {list.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={index === active}
                    aria-label={`Show ${item.title}`}
                    onClick={() => setActive(index)}
                    className={index === active ? 'h-2 w-8 bg-[#99ee2d] transition-all' : 'size-2 bg-white/25 transition-all hover:bg-white/45'}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
