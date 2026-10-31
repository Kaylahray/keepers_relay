'use client';

import { useEffect, useState } from 'react';
import { CarFront, Crosshair } from 'lucide-react';
import { ChainLoader } from '@/components/arena/ChainLoader';
import { Avatar } from '@/components/duel/Avatar';
import { useChainPictures } from '@/components/duel/useChainPictures';
import { Button } from '@/components/ui/Button';
import { EmptyState, PageTitle, Tabs } from '@/components/ui/kit';
import { ART } from '@/lib/art';
import { useMyLockHash } from '@/hooks/useMyLockHash';
import { getCkbClient } from '@/lib/ckb/client';
import { listDuels, type DuelSnapshot } from '@/lib/duel/chain';
import { KIND_ARTILLERY, STATUS_LIVE, STATUS_OPEN, timerShrinkMs } from '@/lib/duel/codec';
import { chainNames, nameOf } from '@/lib/registry/chain-names';
import { duelsConfigured } from '@/lib/registry/config';
import { bytesToHex } from '@/lib/sudden-death/codec';

const ZERO = `0x${'0'.repeat(64)}`;
const CKB = 100_000_000n;

type Tab = 'live' | 'waiting';

/** Duels: what they are, which games, and every duel waiting on you. */
export function DuelsHome() {
  const me = useMyLockHash()?.toLowerCase() ?? null;
  const live = duelsConfigured();
  const [duels, setDuels] = useState<DuelSnapshot[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [tab, setTab] = useState<Tab>('live');

  useEffect(() => {
    if (!live) return;
    let stop = false;
    const read = async () => {
      const found = await listDuels(getCkbClient()).catch(() => null);
      if (stop || !found) return;
      setDuels(found);
      const hashes = found.flatMap((d) => [bytesToHex(d.duel.challenger), bytesToHex(d.duel.opponent)]).filter((h) => h !== ZERO);
      const named = await chainNames(getCkbClient(), [...new Set(hashes)]).catch(() => null);
      if (!stop && named) setNames(named);
    };
    void read();
    const id = window.setInterval(() => {
      if (!document.hidden) void read();
    }, 10_000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [live]);

  const isMine = (d: DuelSnapshot) =>
    me != null && (bytesToHex(d.duel.challenger).toLowerCase() === me || bytesToHex(d.duel.opponent).toLowerCase() === me);
  const all = duels ?? [];
  // Named for me: someone challenged this wallet directly.
  const invites = all.filter((d) => d.duel.status === STATUS_OPEN && me != null && bytesToHex(d.duel.opponent).toLowerCase() === me);
  // Open to anyone, from someone else.
  const open = all.filter((d) => d.duel.status === STATUS_OPEN && bytesToHex(d.duel.opponent) === ZERO && bytesToHex(d.duel.challenger).toLowerCase() !== me);
  const mine = all.filter(isMine).filter((d) => !invites.includes(d));
  const inTab = (d: DuelSnapshot, t: Tab) => (t === 'live' ? d.duel.status === STATUS_LIVE : d.duel.status === STATUS_OPEN);
  const tabList = mine.filter((d) => inTab(d, tab));
  const count = (t: Tab) => mine.filter((d) => inTab(d, t)).length;
  const looking = duels === null && live;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-6 md:px-8 md:pt-12">
      <PageTitle
        eyebrow="Duels"
        tone="pink"
        title="You vs one player"
        intro="Same stake each. Winner takes both. A draw sends them back."
        action={
          <Button href="/duels/new" variant="pink" size="xl">
            Challenge someone
          </Button>
        }
      />

      {!live ? (
        <p className="mt-8 max-w-2xl rounded-xl bg-gold/10 px-4 py-3 text-sm text-gold">Duels aren’t live on this network yet. Challenges open once the duel script is deployed.</p>
      ) : null}

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-10">
          <section aria-labelledby="for-you">
            <h2 id="for-you" className="flex items-center gap-2 font-poster text-lg font-bold uppercase">
              Challenges for you
              {invites.length > 0 ? <span className="grid h-6 min-w-6 place-items-center rounded-md bg-pink px-1.5 font-mono text-xs text-ink">{invites.length}</span> : null}
            </h2>
            {invites.length ? (
              <ul className="mt-4 space-y-3">
                {invites.map((d) => (
                  <DuelRow key={d.duelId} duel={d} names={names} me={me} />
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-2xl bg-ink-2 p-5 text-sm text-mute">{looking ? 'Looking…' : 'No one has challenged you yet. Send the first one.'}</p>
            )}
          </section>

          <section aria-labelledby="your-duels">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="your-duels" className="font-poster text-lg font-bold uppercase">
                Your duels
              </h2>
              <Tabs
                label="Filter your duels"
                tone="pink"
                value={tab}
                onChange={setTab}
                options={[
                  { id: 'live', label: 'Live', count: count('live') },
                  { id: 'waiting', label: 'Waiting', count: count('waiting') },
                ]}
              />
            </div>
            <div className="mt-4">
              {looking ? (
                <ChainLoader compact title="Reading duels from the chain…" />
              ) : tabList.length ? (
                <ul className="space-y-3">
                  {tabList.map((d) => (
                    <DuelRow key={d.duelId} duel={d} names={names} me={me} />
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title={tab === 'live' ? 'Nothing live' : 'Nothing waiting'}
                  body="Your duels show up here once you send or accept a challenge."
                  action={
                    <Button href="/duels/new" variant="pink">
                      Challenge someone
                    </Button>
                  }
                />
              )}
            </div>
          </section>
        </div>

        <div className="space-y-10">
          <section aria-labelledby="open">
            <h2 id="open" className="font-poster text-lg font-bold uppercase">
              Open challenges
            </h2>
            <p className="mt-1 text-sm text-mute">Anyone can take these.</p>
            {open.length ? (
              <ul className="mt-4 space-y-3">
                {open.map((d) => (
                  <DuelRow key={d.duelId} duel={d} names={names} me={me} />
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-2xl bg-ink-2 p-5 text-sm text-mute">{looking ? 'Looking…' : 'No open challenges right now.'}</p>
            )}
          </section>

          <section aria-labelledby="games">
            <h2 id="games" className="font-poster text-lg font-bold uppercase">
              The games
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {[
                { name: 'Artillery', body: 'Fire over the tower. Read the wind.', img: ART.artillery, game: 'artillery' },
                { name: 'Lane race', body: 'Same 5 laps. Higher score wins.', img: ART.laneRace, game: 'race' },
              ].map((g) => (
                <article key={g.name} className="flex flex-col overflow-hidden rounded-2xl bg-ink-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.img} alt="" className="aspect-video w-full object-cover" />
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="font-poster text-sm font-bold uppercase">{g.name}</h3>
                    <p className="mt-1 text-sm text-mute">{g.body}</p>
                    <div className="mt-auto pt-4">
                      <Button href={`/duels/new?game=${g.game}`} variant="pink" size="sm">
                        Challenge
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** One duel in a list: both faces, the game and timer, what the winner takes, and the next step. */
function DuelRow({ duel: snap, names, me }: { duel: DuelSnapshot; names: Map<string, string>; me: string | null }) {
  const { duel } = snap;
  const challengerHash = bytesToHex(duel.challenger).toLowerCase();
  const opponentHash = bytesToHex(duel.opponent).toLowerCase();
  const challenger = nameOf(names, challengerHash);
  const opponent = opponentHash === ZERO ? null : nameOf(names, opponentHash);
  const [pictureA, pictureB] = useChainPictures([challengerHash, opponent ? opponentHash : null]);
  const artillery = duel.kind === KIND_ARTILLERY;
  const GameIcon = artillery ? Crosshair : CarFront;
  const live = duel.status === STATUS_LIVE;
  const involved = me != null && (challengerHash === me || opponentHash === me);
  const pressure = artillery && timerShrinkMs(duel.timerMs) > 0n;
  const stake = Number(duel.stake / CKB);
  const label = live ? (involved ? 'Play' : 'Watch') : challengerHash === me ? 'View' : opponentHash === ZERO ? 'Take it' : 'Accept';

  return (
    <li className="flex flex-col gap-4 rounded-2xl bg-ink-2 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex shrink-0 -space-x-2">
          <Avatar name={challenger} tone="#99ee2d" size={40} src={pictureA} />
          {opponent ? (
            <Avatar name={opponent} tone="#ff56f6" size={40} src={pictureB} />
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-xl border-2 border-dashed border-pink/60 bg-ink font-poster text-xs text-pink">?</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {challenger} <span className="text-mute">vs</span> {opponent ?? <span className="text-pink">anyone</span>}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-mute">
            <GameIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {artillery ? `Artillery · ${pressure ? 'Pressure' : 'Classic'}` : 'Lane race'}
            {live && artillery ? ` · shot ${Math.min(30, duel.shots.length + 1)}/30` : live ? ' · racing' : ' · waiting for an accept'}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <div className="text-left sm:text-right">
          <p className="font-poster text-sm font-bold text-gold">{stake * 2} CKB</p>
          <p className="text-[11px] text-mute">winner takes</p>
        </div>
        <Button href={`/duels/${snap.duelId}`} variant={label === 'Watch' || label === 'View' ? 'ghost' : 'pink'} size="sm">
          {label}
        </Button>
      </div>
    </li>
  );
}
