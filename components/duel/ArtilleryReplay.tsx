'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw, SkipForward } from 'lucide-react';
import { DuelBoard } from '@/components/duel/DuelBoard';
import { Button } from '@/components/ui/Button';
import { replay, type ShotRecord } from '@/lib/duel/artillery';

/** The pause before the first shot, and between one shell landing and the next being fired. */
const FIRST_MS = 900;
const BETWEEN_MS = 1_100;

/** A duel played again, shot by shot: the field the duel started on, then every stored shot (angle, power and the wind it flew in) fired in order on the same board, with the same arcs, blasts and craters. */
export function ArtilleryReplay({
  seed,
  shots,
  names,
  pictures,
  onClose,
}: {
  seed: number;
  shots: ShotRecord[];
  names: [string, string];
  pictures: [string | null, string | null];
  /** Leaves the replay; without it there is no Close button (the replay is the page). */
  onClose?: () => void;
}) {
  // How many shots have been fired so far in this showing, and which showing it is.
  const [fired, setFired] = useState(0);
  const [showing, setShowing] = useState(0);
  const done = fired >= shots.length;

  // The first shot goes after a moment on the untouched field.
  useEffect(() => {
    if (fired !== 0 || shots.length === 0) return;
    const id = window.setTimeout(() => setFired(1), FIRST_MS);
    return () => window.clearTimeout(id);
  }, [fired, showing, shots.length]);

  const board = useMemo(() => replay(seed, shots.slice(0, fired)), [seed, shots, fired]);
  const incoming = useMemo(
    () =>
      fired === 0
        ? null
        : { id: `${showing}-${fired}`, from: replay(seed, shots.slice(0, fired - 1)), shot: shots[fired - 1]! },
    [seed, shots, fired, showing],
  );

  // Each shell that lands fires the next, after a pause to see what it did.
  const next = useCallback(() => {
    window.setTimeout(() => setFired((count) => (count < shots.length ? count + 1 : count)), BETWEEN_MS);
  }, [shots.length]);

  const wind = shots[Math.max(0, fired - 1)]?.wind ?? 0;
  const winner = done ? board.winner : null;

  return (
    <div>
      <DuelBoard
        immersive={false}
        key={showing}
        state={board}
        names={names}
        pictures={pictures}
        wind={wind}
        canFire={false}
        onShot={() => undefined}
        incoming={incoming}
        onIncomingDone={next}
        idleNote={
          !done
            ? `Replay · shot ${Math.max(1, fired)} of ${shots.length}`
            : winner === null
              ? 'Replay over'
              : winner === 'draw'
                ? 'Replay over · a draw'
                : `Replay over · ${names[winner]} won`
        }
      />
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-ink-2 px-3 py-3 md:px-5">
        <div className="flex min-w-[120px] flex-1 gap-1" aria-hidden="true">
          {shots.map((_, i) => (
            <span key={i} className={`h-2 flex-1 rounded-full transition-colors duration-200 ${i < fired ? (i % 2 === 0 ? 'bg-lime' : 'bg-pink') : 'bg-white/15'}`} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFired(0);
              setShowing((n) => n + 1);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Watch again
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setFired(shots.length)} disabled={done}>
            <SkipForward className="h-3.5 w-3.5" aria-hidden="true" /> Skip to the end
          </Button>
          {onClose ? (
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
