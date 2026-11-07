'use client';

import { useCallback, useState } from 'react';
import { ArenaStage } from '@/components/arena/ArenaStage';
import type { DrivenLap } from '@/components/game/CrownRunDrive';
import { DepthsFloor } from '@/components/game/DepthsFloor';
import { DepthsHowTo, DepthsNext, DepthsPicks, DepthsSummary, RelicArt, StairsArt, type FloorLine } from '@/components/game/DepthsScreens';
import { RunLayer } from '@/components/game/RunScreens';
import { Button } from '@/components/ui/Button';
import { PageTitle } from '@/components/ui/kit';
import { PracticeSwitch } from '@/components/practice/PracticeSwitch';
import { withPicks, type LockedLap } from '@/lib/game/crown-run';
import { DEEP, RELICS, SAFE, loadDepths, picksDue } from '@/lib/game/depths';

type Stage = 'intro' | 'play' | 'pick' | 'next' | 'summary';

/** A practice map is random, so practising can't show a map from a real run. */
function randomSeed(): bigint {
  const parts = crypto.getRandomValues(new Uint32Array(2));
  return (BigInt(parts[0]!) << 32n) | BigInt(parts[1]!);
}

export function DepthsPractice() {
  const [stage, setStage] = useState<Stage>('intro');
  const [floors, setFloors] = useState<LockedLap[]>([]);
  const [seed, setSeed] = useState(0n);
  const [stairs, setStairs] = useState(SAFE);
  const [played, setPlayed] = useState<DrivenLap | null>(null);
  const [lines, setLines] = useState<FloorLine[]>([]);
  const [checked, setChecked] = useState<boolean | null>(null);
  // Remounts the floor for each floor and each new run.
  const [floorKey, setFloorKey] = useState(0);

  const begin = useCallback(() => {
    setFloors([]);
    setLines([]);
    setStairs(SAFE);
    setPlayed(null);
    setChecked(null);
    setSeed(randomSeed());
    setFloorKey((key) => key + 1);
    setStage('next');
  }, []);

  // A finished practice run goes through the same replay the chain would run, so a mismatch shows here first.
  const finish = useCallback(async (all: LockedLap[], live: number) => {
    setStage('summary');
    const runner = await loadDepths();
    setChecked(runner.replay(all) === live);
  }, []);

  const onFloor = useCallback(
    (floor: DrivenLap) => {
      setPlayed(floor);
      const index = floors.length;
      const earlier = lines.reduce((sum, line) => sum + line.score, 0);
      setLines([...lines, { score: floor.score - earlier, stairs, relic: null }]);
      if (floor.crashed || picksDue(index) === 0) {
        void finish([...floors, { seed, bytes: floor.moves }], floor.score);
        return;
      }
      setStage('pick');
    },
    [finish, floors, lines, stairs, seed],
  );

  const onPick = useCallback(
    (relic: number, next: number) => {
      if (!played) return;
      setFloors([...floors, { seed, bytes: withPicks(played.moves, relic, next) }]);
      setLines(lines.map((line, i) => (i === lines.length - 1 ? { ...line, relic } : line)));
      setPlayed({ ...played, owned: played.owned | (1 << relic) });
      setStairs(next);
      setSeed(randomSeed());
      setStage('next');
    },
    [played, floors, lines, seed],
  );

  const score = played?.score ?? 0;

  if (stage === 'intro') {
    return (
      <ArenaStage backHref="/games" backLabel="Play">
        <div className="mx-auto max-w-xl">
          <PracticeSwitch game="depths" />
          <PageTitle eyebrow="Free" title="Practice Crown Depths" intro="The same dungeon as a real crown, on a random map. Free, and nothing is saved." />
          <div className="mt-6">
            <DepthsHowTo />
          </div>
          <h2 className="mt-8 font-poster text-sm font-bold uppercase">Items you can pick</h2>
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {RELICS.map((relic) => (
              <li key={relic.id} className="overflow-hidden rounded-xl bg-ink-3">
                <span className="block aspect-[3/2]">
                  <RelicArt id={relic.id} />
                </span>
                <span className="block truncate px-2 py-1.5 text-center text-[11px] font-semibold">{relic.name}</span>
              </li>
            ))}
          </ul>
          <h2 className="mt-5 font-poster text-sm font-bold uppercase">The stairs</h2>
          <ul className="mt-2 grid grid-cols-2 gap-2">
            {[SAFE, DEEP].map((item) => (
              <li key={item} className="overflow-hidden rounded-xl bg-ink-3">
                <span className="block aspect-[2/1]">
                  <StairsArt stairs={item} />
                </span>
                <span className={`block px-2 py-1.5 text-center text-[11px] font-semibold ${item === DEEP ? 'text-danger' : 'text-lime'}`}>{item === DEEP ? 'Deep' : 'Safe'}</span>
              </li>
            ))}
          </ul>
          <Button variant="lime" size="xl" block className="mt-8" onClick={begin}>
            Enter the dungeon
          </Button>
        </div>
      </ArenaStage>
    );
  }

  return (
    <RunLayer>
      {stage === 'play' ? <DepthsFloor key={floorKey} floors={floors} seed={seed} onDone={onFloor} /> : null}
      {stage === 'pick' && played ? <DepthsPicks floor={floors.length} owned={played.owned} score={score} onPick={onPick} /> : null}
      {stage === 'next' ? (
        <DepthsNext floor={floors.length} score={score} owned={played?.owned ?? 0} stairs={stairs}>
          <Button
            variant="lime"
            size="xl"
            block
            onClick={() => {
              setFloorKey((key) => key + 1);
              setStage('play');
            }}
          >
            Enter floor {floors.length + 1}
          </Button>
          <button type="button" onClick={() => setStage('intro')} className="h-10 w-full text-sm font-semibold text-mute hover:text-white">
            Leave practice
          </button>
        </DepthsNext>
      ) : null}
      {stage === 'summary' && played ? (
        <DepthsSummary
          title={played.crashed ? `Run ended on floor ${lines.length}` : 'Run finished'}
          score={score}
          endedFloor={played.crashed ? lines.length - 1 : null}
          gold={played.coins}
          owned={played.owned}
          lines={lines}
          note={
            checked === false ? (
              <p className="mt-3 rounded-lg bg-danger/15 px-3 py-2 text-xs font-semibold text-danger">The replay gave a different score. This is a bug in the game.</p>
            ) : null
          }
        >
          <Button variant="lime" size="xl" block onClick={begin}>
            Practice again
          </Button>
          <Button variant="outline" size="lg" block href="/play">
            Play for a crown
          </Button>
          <button type="button" onClick={() => setStage('intro')} className="h-10 w-full text-sm font-semibold text-mute hover:text-white">
            Back
          </button>
        </DepthsSummary>
      ) : null}
    </RunLayer>
  );
}
