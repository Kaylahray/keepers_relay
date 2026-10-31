'use client';

import { Timer } from 'lucide-react';
import { Avatar } from '@/components/duel/Avatar';
import { useChainPictures } from '@/components/duel/useChainPictures';
import { Button } from '@/components/ui/Button';
import { Ckb, HpBlocks } from '@/components/ui/kit';
import { useEffect, useState } from 'react';
import { fetchCrownList } from '@/lib/crown/remote';
import { ckbWhole, GAMES, type CrownRoom } from '@/lib/crown/rooms';
import { ART } from '@/lib/art';
import { getCkbClient } from '@/lib/ckb/client';
import { replay } from '@/lib/duel/artillery';
import { listDuels, type DuelSnapshot } from '@/lib/duel/chain';
import { duelSeed, KIND_ARTILLERY, STATUS_LIVE, timerShrinkMs } from '@/lib/duel/codec';
import { chainNames, nameOf } from '@/lib/registry/chain-names';
import { duelsConfigured } from '@/lib/registry/config';
import { bytesToHex, hexToBytes } from '@/lib/sudden-death/codec';

const HERO_BLURB =
  'Quick arcade games against real people. Stakes sit in a smart contract, and the CKB chain replays every game before anyone is paid.';
/** How long each live game stays on the card before the next one. */
const ROTATE_MS = 6_000;
const ZERO = `0x${'0'.repeat(64)}`;

function clockFace(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** One thing happening now: a crown (from the lobby list) or a duel (read from the chain). */
type Happening = { kind: 'crown'; room: CrownRoom } | { kind: 'duel'; duel: DuelSnapshot };

/** Live crowns first (soonest deadline), then duels being played, then open challenges and lobbies. */
function featured(rooms: CrownRoom[], duels: DuelSnapshot[]): Happening[] {
  const live = rooms
    .filter((room) => room.status === 'live' && room.deadlineAt != null && room.deadlineAt > Date.now())
    .sort((a, b) => (a.deadlineAt ?? 0) - (b.deadlineAt ?? 0))
    .map((room) => ({ kind: 'crown' as const, room }));
  const fighting = duels.filter((d) => d.duel.status === STATUS_LIVE).map((duel) => ({ kind: 'duel' as const, duel }));
  const open = duels.filter((d) => d.duel.status !== STATUS_LIVE).map((duel) => ({ kind: 'duel' as const, duel }));
  const lobbies = rooms.filter((room) => room.status === 'lobby').map((room) => ({ kind: 'crown' as const, room }));
  return [...live.slice(0, 3), ...fighting.slice(0, 3), ...open.slice(0, 2), ...lobbies.slice(0, 2)];
}

/** The top of the home page: the headline and the two ways in, with the players facing off beside it. */
export function HomeHero() {
  return (
    <section className="mx-auto grid max-w-7xl gap-8 px-4 pt-4 md:px-8 md:pt-10 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-12">
      <div className="order-2 lg:order-1">
        <h1 className="font-poster text-[34px] font-black uppercase leading-[1.02] tracking-tight md:text-6xl">
          Play for real CKB.
          <br />
          <span className="text-lime">The chain judges.</span>
        </h1>
        <p className="mt-5 max-w-md text-base text-mute md:text-lg">{HERO_BLURB}</p>
        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
          <Button href="/play" size="lg">
            Find a crown
          </Button>
          <Button href="/duels/new" variant="pink" size="lg">
            Challenge someone to a duel
          </Button>
        </div>
      </div>
      <div className="order-1 -mx-4 lg:order-2 lg:mx-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ART.hero}
          alt="Two players face off with a glowing crown between them, a race car and a tank behind"
          className="aspect-[16/10] w-full object-cover lg:clip-panel"
        />
      </div>
    </section>
  );
}

/** What is happening now, read live: crowns from the lobby, duels from the chain. Rotates every few seconds. */
export function LiveNow() {
  const [items, setItems] = useState<Happening[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stop = false;
    // The first read always runs; later polls skip while the tab is in the background.
    const load = async (first = false) => {
      if (!first && document.hidden) return;
      const [rooms, duels] = await Promise.all([
        fetchCrownList().catch(() => [] as CrownRoom[]),
        duelsConfigured() ? listDuels(getCkbClient(), 30).catch(() => [] as DuelSnapshot[]) : Promise.resolve([] as DuelSnapshot[]),
      ]);
      if (stop) return;
      setItems(featured(rooms, duels));
      const players = duels.flatMap((d) => [bytesToHex(d.duel.challenger), bytesToHex(d.duel.opponent)]).filter((hash) => hash !== ZERO);
      if (players.length > 0) {
        void chainNames(getCkbClient(), players)
          .then((found) => {
            if (!stop) setNames(found);
          })
          .catch(() => undefined);
      }
    };
    void load(true);
    const poll = window.setInterval(() => void load(), 15_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      stop = true;
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, []);

  const list = items ?? [];
  // Cycle through what is happening, unless the reader is looking at the card.
  useEffect(() => {
    if (paused || list.length < 2) return;
    const id = window.setInterval(() => setActive((index) => (index + 1) % list.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [paused, list.length]);
  const item = list[Math.min(active, Math.max(0, list.length - 1))] ?? null;

  return (
    <section
      aria-label="Happening now"
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`clip-panel relative bg-ink-2 p-5 md:p-7 ${item?.kind === 'duel' ? 'shadow-[inset_4px_0_0_#ff56f6]' : 'shadow-[inset_4px_0_0_#99ee2d]'}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider">
          <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden="true" /> Happening now
        </h2>
        {list.length > 1 ? (
          <div className="flex gap-1.5" role="tablist" aria-label="Choose a live game">
            {list.map((entry, index) => (
              <button
                key={entry.kind === 'crown' ? entry.room.id : entry.duel.duelId}
                type="button"
                role="tab"
                aria-selected={index === active}
                aria-label={entry.kind === 'crown' ? `Show ${entry.room.title}` : 'Show this duel'}
                onClick={() => setActive(index)}
                className="grid h-6 w-8 place-items-center"
              >
                <span className={`h-1.5 rounded-full transition-[width,background-color] duration-200 ${index === active ? 'w-6 bg-white' : 'w-1.5 bg-white/30'}`} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {items == null ? (
        <p className="py-4 font-mono text-[11px] uppercase text-mute">Looking for games…</p>
      ) : item?.kind === 'crown' ? (
        <CrownSlide room={item.room} now={now} />
      ) : item?.kind === 'duel' ? (
        <DuelSlide duel={item.duel} names={names} />
      ) : (
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-poster text-2xl font-black uppercase">Nothing running right now</p>
            <p className="mt-1 text-sm text-mute">Open a crown for everyone, or challenge one player.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button href="/create" size="lg">
              Open a crown
            </Button>
            <Button href="/duels/new" variant="pink" size="lg">
              Challenge someone
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function CrownSlide({ room, now }: { room: CrownRoom; now: number }) {
  const [kingPicture] = useChainPictures([room.kingHash]);
  const live = room.status === 'live' && room.deadlineAt != null;
  const left = live ? (room.deadlineAt ?? now) - now : 0;
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-10">
      <div className="flex min-w-0 items-center gap-4">
        <Avatar name={room.king ?? room.title} tone="#e1bf47" size={56} src={kingPicture} />
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-wider text-lime">
            {live ? 'Live crown' : 'Lobby open'} · {GAMES[room.game].title}
          </p>
          <p className="mt-1 truncate font-poster text-lg font-bold uppercase">{room.title}</p>
          <p className="truncate text-sm text-mute">
            {room.king ? (
              <>
                <span className="font-semibold text-white">{room.king}</span> holds it with <span className="font-mono font-bold text-white">{room.kingScore}</span>
              </>
            ) : (
              'No crown yet. First run takes it.'
            )}
          </p>
        </div>
      </div>
      <div className="flex flex-1 items-end gap-8">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Prize</p>
          <Ckb value={ckbWhole(room.potShannons)} size="lg" />
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-mute">{live ? 'Time left' : 'Entry'}</p>
          {live ? (
            <p className={`inline-flex items-center gap-1.5 font-poster text-2xl font-bold tabular-nums md:text-3xl ${left < 120_000 ? 'text-danger' : 'text-white'}`}>
              <Timer className="h-5 w-5" aria-hidden="true" />
              {clockFace(left)}
            </p>
          ) : (
            <Ckb value={ckbWhole(room.feeShannons)} size="lg" />
          )}
        </div>
      </div>
      <Button href={`/play/${room.id}`} size="lg" className="w-full md:w-auto">
        {live ? 'Play this crown' : 'Take a seat'}
      </Button>
    </div>
  );
}

/** A duel as the chain has it now: who, what for, and how far it has got. */
function DuelSlide({ duel: snap, names }: { duel: DuelSnapshot; names: Map<string, string> }) {
  const { duel } = snap;
  const live = duel.status === STATUS_LIVE;
  const challenger = nameOf(names, bytesToHex(duel.challenger));
  const opponentHash = bytesToHex(duel.opponent);
  const [challengerPicture, opponentPicture] = useChainPictures([bytesToHex(duel.challenger), opponentHash === ZERO ? null : opponentHash]);
  const opponent = opponentHash === ZERO ? 'anyone' : nameOf(names, opponentHash);
  const artillery = duel.kind === KIND_ARTILLERY;
  const game = artillery ? (timerShrinkMs(duel.timerMs) > 0n ? 'Artillery · Pressure' : 'Artillery') : 'Lane race';
  const stake = Number(duel.stake / 100_000_000n);
  // Artillery health, replayed from the shots on chain.
  const board = artillery && live && duel.shots.length > 0 ? replay(duelSeed(hexToBytes(snap.duelId), duel.seedBlock), duel.shots) : null;
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-10">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex shrink-0 -space-x-3">
          <Avatar name={challenger} tone="#99ee2d" size={56} src={challengerPicture} />
          <Avatar name={opponent} tone="#ff56f6" size={56} src={opponentPicture} />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-wider text-pink">
            {live ? 'Live duel' : 'Open challenge'} · {game}
          </p>
          <p className="mt-1 truncate text-sm font-semibold">
            {challenger} <span className="text-mute">vs</span> {opponent}
          </p>
        </div>
      </div>
      <div className="flex flex-1 flex-wrap items-end gap-x-8 gap-y-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Winner takes</p>
          <Ckb value={stake * 2} size="lg" />
        </div>
        {board ? (
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Shot {duel.shots.length + 1}/30</p>
            {([0, 1] as const).map((side) => (
              <div key={side} className="flex items-center gap-2">
                <span className="w-14 truncate text-[11px] text-mute">{side === 0 ? challenger : opponent}</span>
                <HpBlocks hp={board.tanks[side].hp} tone={side === 0 ? 'lime' : 'pink'} size="sm" />
              </div>
            ))}
          </div>
        ) : (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-mute">{artillery ? 'Shots' : 'Laps'}</p>
            <p className="font-poster text-2xl font-bold">{artillery ? `${duel.shots.length}/30` : '5'}</p>
          </div>
        )}
      </div>
      <Button href={`/duels/${snap.duelId}`} variant="pink" size="lg" className="w-full md:w-auto">
        {live ? 'Watch this duel' : opponentHash === ZERO ? 'Take it' : 'See the challenge'}
      </Button>
    </div>
  );
}
