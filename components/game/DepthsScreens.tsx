'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Footprints, Flame, Gem, Shield, Sword } from 'lucide-react';
import { PictureCard } from '@/components/game/RunPicks';
import { Button } from '@/components/ui/Button';
import { LapBoxes, type LapState } from '@/components/ui/kit';
import { ARMOR, BOOTS, DEEP, DEPTHS, GREED, LANTERN, MONSTERS, RELICS, SAFE, SWORD, deepBonus, fallbackRelic, hasRelic } from '@/lib/game/depths';

const ICONS = { [SWORD]: Sword, [ARMOR]: Shield, [BOOTS]: Footprints, [LANTERN]: Flame, [GREED]: Gem } as const;

const FRAME = 'block h-full w-full';

/** A relic on a stone plinth, lit from above. */
export function RelicArt({ id }: { id: number }) {
  return (
    <svg viewBox="0 0 120 80" className={FRAME} aria-hidden="true">
      <rect width="120" height="80" fill="#1d1922" />
      <ellipse cx="60" cy="18" rx="46" ry="30" fill="#ffaa3c" opacity=".12" />
      <path d="M30 66h60l-6 10H36Z" fill="#3b3544" />
      <rect x="34" y="60" width="52" height="7" rx="2" fill="#4a4354" />
      <g transform="translate(60 38)">
        {id === SWORD ? (
          <g transform="rotate(-35)">
            <rect x="-3" y="-26" width="6" height="34" rx="2" fill="#c9d0d8" />
            <path d="M-3-26 0-32 3-26Z" fill="#c9d0d8" />
            <rect x="-11" y="7" width="22" height="5" rx="2" fill="#e1bf47" />
            <rect x="-2.500" y="12" width="5" height="10" fill="#6b4423" />
          </g>
        ) : id === ARMOR ? (
          <g>
            <path d="M-18-16 0-22l18 6v12q0 18-18 26Q-18 14-18-4Z" fill="#9aa3ad" />
            <path d="M-11-11 0-15l11 4v8q0 12-11 18Q-11 9-11-3Z" fill="#c9d0d8" />
            <path d="M0-15v32" stroke="#e1bf47" strokeWidth="3" />
          </g>
        ) : id === BOOTS ? (
          <g fill="#7a4a22">
            <path d="M-20-12h10v18h8v8h-18Z" />
            <path d="M2-12h10v18h8v8H2Z" />
            <path d="M-20 10h18M2 10h18" stroke="#e1bf47" strokeWidth="2" />
          </g>
        ) : id === LANTERN ? (
          <g>
            <path d="M-8-24h16" stroke="#8a7a52" strokeWidth="3" />
            <rect x="-12" y="-20" width="24" height="32" rx="4" fill="#3b3544" stroke="#8a7a52" strokeWidth="3" />
            <ellipse cx="0" cy="-2" rx="6" ry="10" fill="#ff8a1f" />
            <ellipse cx="0" cy="1" rx="3" ry="5" fill="#ffe08a" />
          </g>
        ) : (
          <g>
            <path d="M-16-6q0-12 16-12t16 12v14q0 12-16 12T-16 8Z" fill="#7a4a22" />
            <path d="M-8-18q8-8 16 0" stroke="#5a3415" strokeWidth="4" fill="none" />
            <circle cx="-6" cy="2" r="5" fill="#e1bf47" />
            <circle cx="5" cy="5" r="5" fill="#e1bf47" />
            <circle cx="0" cy="-4" r="5" fill="#f2d672" />
          </g>
        )}
      </g>
    </svg>
  );
}

/** A stairway down: torch-lit stone for safe stairs, red glow and claws for deep ones. */
export function StairsArt({ stairs }: { stairs: number }) {
  const deep = stairs === DEEP;
  return (
    <svg viewBox="0 0 160 80" className={FRAME} aria-hidden="true">
      <rect width="160" height="80" fill={deep ? '#1b0d10' : '#1d1922'} />
      <path d="M20 80 52 14h56l32 66Z" fill={deep ? '#2a1418' : '#2a2531'} />
      {[0, 1, 2, 3, 4].map((k) => (
        <rect key={k} x={56 - k * 6} y={18 + k * 12} width={48 + k * 12} height="6" fill={deep ? '#3a1a1f' : '#3b3544'} />
      ))}
      <ellipse cx="80" cy="16" rx="26" ry="8" fill={deep ? '#ff5a5a' : '#ffaa3c'} opacity=".35" />
      {deep ? (
        <g fill="#ff5a5a">
          <circle cx="70" cy="10" r="2" />
          <circle cx="78" cy="10" r="2" />
          <circle cx="90" cy="12" r="2" />
          <circle cx="98" cy="12" r="2" />
        </g>
      ) : (
        <g>
          <rect x="30" y="20" width="4" height="14" fill="#6b4423" />
          <ellipse cx="32" cy="18" rx="4" ry="6" fill="#ff8a1f" />
          <rect x="126" y="20" width="4" height="14" fill="#6b4423" />
          <ellipse cx="128" cy="18" rx="4" ry="6" fill="#ff8a1f" />
        </g>
      )}
    </svg>
  );
}

/** The relics a run holds, as small icons. */
export function RelicBadges({ owned }: { owned: number }) {
  return (
    <div className="flex items-center gap-1" aria-label="Your items">
      {RELICS.filter((relic) => hasRelic(owned, relic.id)).map((relic) => {
        const Icon = ICONS[relic.id];
        return (
          <span key={relic.id} title={relic.name} className="inline-flex h-6 items-center rounded-md bg-white/10 px-1.5 text-white">
            <Icon className="h-3.5 w-3.5" aria-label={relic.name} />
          </span>
        );
      })}
    </div>
  );
}

/** The relics a run holds, as small pictures with their names. */
export function RelicStrip({ owned }: { owned: number }) {
  const owns = RELICS.filter((relic) => hasRelic(owned, relic.id));
  if (owns.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Your items">
      {owns.map((relic) => (
        <li key={relic.id} className="w-20 overflow-hidden rounded-lg bg-ink-3">
          <span className="block aspect-[3/2]">
            <RelicArt id={relic.id} />
          </span>
          <span className="block truncate px-1.5 py-1 text-center text-[10px] font-semibold">{relic.name}</span>
        </li>
      ))}
    </ul>
  );
}

const STEPS = [
  ['Your goal', 'Reach the stairs on each floor before your torch runs out. There are 4 floors.'],
  ['Move', 'Arrow keys or W A S D. On a phone, the buttons under the map. Each press is one step.'],
  ['Fight', 'Walk into a monster to hit it. If a monster walks into you, you lose a heart.'],
  ['Score', 'Pick up gold, beat monsters, open the chest (find the key first), and reach the stairs with time left.'],
  ['Game over', 'If your hearts or your torch run out, the run stops. You keep the points you have.'],
  ['Between floors', 'Choose one item to keep, and choose safe or deep stairs. Deep floors are harder but pay more.'],
] as const;

/** How to play, for the practice page and the screen before the first floor. */
export function DepthsHowTo() {
  return (
    <div className="space-y-4">
      <dl className="space-y-2 text-sm">
        {STEPS.map(([title, body]) => (
          <div key={title}>
            <dt className="font-semibold text-white">{title}</dt>
            <dd className="text-mute">{body}</dd>
          </div>
        ))}
      </dl>
      <ul className="grid grid-cols-3 gap-2 text-center text-xs" aria-label="Monsters">
        {MONSTERS.map((m) => (
          <li key={m.id} className="rounded-lg bg-ink-3 px-2 py-2">
            <span className="block font-semibold text-white">{m.name}</span>
            <span className="text-mute">{m.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type PicksProps = {
  /** The floor just cleared, by its index from zero. */
  floor: number;
  owned: number;
  score: number;
  /** Seconds on the timer, or null for no timer. */
  seconds?: number | null;
  onPick: (relic: number, stairs: number) => void;
};

/** The choice after a cleared floor: a relic, and safe or deep stairs down. */
export function DepthsPicks({ floor, owned, score, seconds = DEPTHS.PICK_SECONDS, onPick }: PicksProps) {
  const [relic, setRelic] = useState<number | null>(null);
  const [stairs, setStairs] = useState<number | null>(null);
  const [left, setLeft] = useState(seconds);
  const choice = useRef({ relic, stairs });
  useEffect(() => {
    choice.current = { relic, stairs };
  }, [relic, stairs]);
  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (seconds == null) return;
    const ends = Date.now() + seconds * 1000;
    const timer = setInterval(() => {
      const now = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
      setLeft(now);
      if (now > 0) return;
      clearInterval(timer);
      // Time's up: keep whatever is chosen, and fill the rest with the safest picks.
      pickRef.current(choice.current.relic ?? fallbackRelic(owned), choice.current.stairs ?? SAFE);
    }, 250);
    return () => clearInterval(timer);
  }, [seconds, owned]);

  const ready = relic != null && stairs != null;

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col overflow-y-auto px-4" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-lime">Floor {floor + 1} clear</p>
          <p className="font-poster text-3xl font-black tabular-nums">{score}</p>
        </div>
        {left != null ? (
          <p className={`font-mono text-2xl font-bold tabular-nums ${left <= 5 ? 'text-danger' : 'text-mute'}`} aria-label={`${left} seconds to choose`}>
            {left}s
          </p>
        ) : null}
      </div>

      <section className="mt-4">
        <h2 className="font-poster text-sm font-bold uppercase">Pick an item to keep</h2>
        <p className="text-xs text-mute">You keep it until the run ends.</p>
        <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Relic">
          {RELICS.filter((item) => !hasRelic(owned, item.id)).map((item) => (
            <PictureCard key={item.id} on={relic === item.id} tone="lime" name={item.name} detail={item.effect} onClick={() => setRelic(item.id)}>
              <RelicArt id={item.id} />
            </PictureCard>
          ))}
        </div>
      </section>

      <section className="mt-4">
        <h2 className="font-poster text-sm font-bold uppercase">Pick the stairs down</h2>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Stairs">
          <PictureCard on={stairs === SAFE} tone="lime" name="Safe stairs" detail="A normal floor." badge="No bonus" wide onClick={() => setStairs(SAFE)}>
            <StairsArt stairs={SAFE} />
          </PictureCard>
          <PictureCard on={stairs === DEEP} tone="danger" name="Deep stairs" detail="More monsters and more gold. Extra points if you reach its stairs." badge={`+${deepBonus(floor + 1)}`} wide onClick={() => setStairs(DEEP)}>
            <StairsArt stairs={DEEP} />
          </PictureCard>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 mt-auto bg-ink px-4 pb-3 pt-3">
        <Button variant="lime" size="lg" block disabled={!ready} onClick={() => relic != null && stairs != null && onPick(relic, stairs)}>
          Lock in my picks
        </Button>
        <p className="mt-2 text-center text-xs text-mute">You can&apos;t change these after locking in.</p>
      </div>
    </div>
  );
}

/** The screen between floors: where the run stands and what the next floor will be. */
export function DepthsNext({ floor, score, owned, stairs, aside, children }: { floor: number; score: number; owned: number; stairs: number; aside?: ReactNode; children: ReactNode }) {
  const states: LapState[] = Array.from({ length: DEPTHS.FLOORS }, (_, i) => (i < floor ? 'done' : i === floor ? 'current' : 'empty'));
  const deep = stairs === DEEP;
  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-y-auto px-4 pb-4" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
      <div className="relative aspect-[2/1] w-full shrink-0 overflow-hidden rounded-2xl">
        <StairsArt stairs={stairs} />
      </div>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-mute">Next: floor {floor + 1} of {DEPTHS.FLOORS}</p>
      <h2 className={`mt-1 font-poster text-3xl font-black uppercase ${deep ? 'text-danger' : 'text-lime'}`}>{deep ? 'Deep floor' : floor === 0 ? 'The first floor' : 'Safe floor'}</h2>
      {deep ? <p className="mt-1 text-sm text-mute">More monsters. Reach its stairs for {deepBonus(floor)} extra points.</p> : null}
      {floor === 0 ? (
        <div className="mt-3">
          <DepthsHowTo />
        </div>
      ) : null}
      <div className="mt-4">
        <LapBoxes states={states} label="Your floors" />
      </div>
      <dl className="mt-4">
        <div className="flex items-center justify-between">
          <dt className="text-sm text-mute">Your score</dt>
          <dd className="font-poster text-2xl font-black tabular-nums">{score}</dd>
        </div>
      </dl>
      <div className="mt-3">
        <RelicStrip owned={owned} />
      </div>
      {aside}
      <div className="mt-auto space-y-2 pt-4">{children}</div>
    </div>
  );
}

export type FloorLine = { score: number; stairs: number; relic: number | null };

/** The end of a run: the score, each floor's picks and points, and what the mode adds. */
export function DepthsSummary({
  title,
  score,
  endedFloor,
  gold,
  owned,
  lines,
  unused,
  note,
  children,
}: {
  title: string;
  score: number;
  /** The floor the run ended on without clearing it, by its index from zero. */
  endedFloor?: number | null;
  gold: number;
  owned: number;
  lines: FloorLine[];
  unused?: string | null;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-y-auto px-4 pb-4" style={{ paddingTop: 'max(24px, env(safe-area-inset-top))' }}>
      <p className={`font-mono text-[11px] uppercase tracking-wider ${endedFloor != null ? 'text-danger' : 'text-lime'}`}>{title}</p>
      <p className="mt-1 font-poster text-6xl font-black tabular-nums">{score}</p>
      <p className="mt-1 text-sm text-mute">{gold} gold picked up</p>
      <div className="mt-4">
        <RelicStrip owned={owned} />
      </div>
      <table className="mt-4 w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>Floor</th>
            <th>Stairs</th>
            <th>Picked after</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className="border-t border-white/5">
              <td className="py-2 font-mono text-xs text-mute">Floor {i + 1}{endedFloor === i ? ' ✕' : ''}</td>
              <td className={`py-2 text-xs font-semibold ${line.stairs === DEEP ? 'text-danger' : 'text-lime'}`}>{line.stairs === DEEP ? 'Deep' : 'Safe'}</td>
              <td className="py-2 text-xs text-mute">{line.relic != null ? `+ ${RELICS[line.relic]!.name}` : ''}</td>
              <td className="py-2 text-right font-mono tabular-nums">{line.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {unused ? <p className="mt-3 text-xs text-mute">{unused}</p> : null}
      {note}
      <div className="mt-auto space-y-2 pt-4">{children}</div>
    </div>
  );
}
