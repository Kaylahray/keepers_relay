'use client';

import { useCallback, useState } from 'react';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { CrownRunDrive, type DrivenLap } from '@/components/game/CrownRunDrive';
import { RoadArt, UpgradeArt } from '@/components/game/RunArt';
import { RunPicks } from '@/components/game/RunPicks';
import { NextLap, RunLayer, RunSummary, type LapLine } from '@/components/game/RunScreens';
import { Button } from '@/components/ui/Button';
import { PageTitle } from '@/components/ui/kit';
import { DANGER, SAFE, UPGRADES, loadCrownRun, picksDue, withPicks, type LockedLap } from '@/lib/game/crown-run';

type Stage = 'intro' | 'drive' | 'pick' | 'next' | 'summary';

/** A practice road is random, so practising can't show a road from a real run. */
function randomSeed(): bigint {
  const parts = crypto.getRandomValues(new Uint32Array(2));
  return (BigInt(parts[0]!) << 32n) | BigInt(parts[1]!);
}

export function PracticeView() {
  const [stage, setStage] = useState<Stage>('intro');
  const [laps, setLaps] = useState<LockedLap[]>([]);
  const [seed, setSeed] = useState(0n);
  const [road, setRoad] = useState(SAFE);
  const [driven, setDriven] = useState<DrivenLap | null>(null);
  const [lines, setLines] = useState<LapLine[]>([]);
  const [checked, setChecked] = useState<boolean | null>(null);
  // Remounts the road for each lap and each new run.
  const [driveKey, setDriveKey] = useState(0);

  const begin = useCallback(() => {
    setLaps([]);
    setLines([]);
    setRoad(SAFE);
    setDriven(null);
    setChecked(null);
    setSeed(randomSeed());
    setDriveKey((key) => key + 1);
    setStage('drive');
  }, []);

  // A finished practice run goes through the same replay the chain would run, so a mismatch shows here first.
  const finish = useCallback(async (all: LockedLap[], live: number) => {
    setStage('summary');
    const runner = await loadCrownRun();
    setChecked(runner.replay(all) === live);
  }, []);

  const onLap = useCallback(
    (lap: DrivenLap) => {
      setDriven(lap);
      const index = laps.length;
      const earlier = lines.reduce((sum, line) => sum + line.score, 0);
      setLines([...lines, { score: lap.score - earlier, road, upgrade: null }]);
      if (lap.crashed || picksDue(index) === 0) {
        void finish([...laps, { seed, bytes: lap.moves }], lap.score);
        return;
      }
      setStage('pick');
    },
    [finish, laps, lines, road, seed],
  );

  const onPick = useCallback(
    (upgrade: number | null, next: number) => {
      if (!driven) return;
      setLaps([...laps, { seed, bytes: withPicks(driven.moves, upgrade, next) }]);
      setLines(lines.map((line, i) => (i === lines.length - 1 ? { ...line, upgrade } : line)));
      setRoad(next);
      setSeed(randomSeed());
      setStage('next');
    },
    [driven, laps, lines, seed],
  );

  const score = driven?.score ?? 0;

  if (stage === 'intro') {
    return (
      <ArenaStage backHref="/games" backLabel="Play">
        <div className="mx-auto max-w-xl">
          <PageTitle eyebrow="Free" title="Practice Crown Run" intro="The real game on a random road. Nothing here is saved and nothing costs anything." />
          <ol className="mt-6 space-y-3 text-sm text-mute">
            <li><span className="font-semibold text-white">Drive.</span> Five laps of 30 seconds. Change lanes, dodge the blocks and grab the coins. A crash ends the run, and your points stay.</li>
            <li><span className="font-semibold text-white">Pick.</span> After laps 1, 2 and 3 pick an upgrade. After laps 1 to 4 pick the next road.</li>
            <li><span className="font-semibold text-white">Risk it.</span> A danger road is harder, with more coins and a bonus if you finish the lap.</li>
          </ol>
          <h2 className="mt-8 font-poster text-sm font-bold uppercase">The upgrades</h2>
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {UPGRADES.map((upgrade) => (
              <li key={upgrade.id} className="overflow-hidden rounded-xl bg-ink-3">
                <span className="block aspect-[3/2]">
                  <UpgradeArt id={upgrade.id} />
                </span>
                <span className="block truncate px-2 py-1.5 text-center text-[11px] font-semibold">{upgrade.name}</span>
              </li>
            ))}
          </ul>
          <h2 className="mt-5 font-poster text-sm font-bold uppercase">The roads</h2>
          <ul className="mt-2 grid grid-cols-2 gap-2">
            {[SAFE, DANGER].map((item) => (
              <li key={item} className="overflow-hidden rounded-xl bg-ink-3">
                <span className="block aspect-[3/1]">
                  <RoadArt road={item} />
                </span>
                <span className={`block px-2 py-1.5 text-center text-[11px] font-semibold ${item === DANGER ? 'text-danger' : 'text-lime'}`}>{item === DANGER ? 'Danger' : 'Safe'}</span>
              </li>
            ))}
          </ul>
          <Button variant="lime" size="xl" block className="mt-8" onClick={begin}>
            Start driving
          </Button>
          <p className="mt-3 text-center text-xs text-mute">Left and right arrows, or tap either side of the road.</p>
        </div>
      </ArenaStage>
    );
  }

  return (
    <RunLayer>
      {stage === 'drive' ? <CrownRunDrive key={driveKey} laps={laps} seed={seed} onDone={onLap} /> : null}
      {stage === 'pick' && driven ? <RunPicks lap={laps.length} owned={driven.owned} score={score} onPick={onPick} /> : null}
      {stage === 'next' && driven ? (
        <NextLap lap={laps.length} score={score} owned={ownedAfter(driven.owned, lines)} road={road}>
          <Button
            variant="lime"
            size="xl"
            block
            onClick={() => {
              setDriveKey((key) => key + 1);
              setStage('drive');
            }}
          >
            Start lap {laps.length + 1}
          </Button>
          <button type="button" onClick={() => setStage('intro')} className="h-10 w-full text-sm font-semibold text-mute hover:text-white">
            Leave practice
          </button>
        </NextLap>
      ) : null}
      {stage === 'summary' && driven ? (
        <RunSummary
          title={driven.crashed ? `Crashed on lap ${lines.length}` : 'Run finished'}
          score={score}
          crashedLap={driven.crashed ? lines.length - 1 : null}
          coins={driven.coins}
          owned={driven.owned}
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
        </RunSummary>
      ) : null}
    </RunLayer>
  );
}

/** The upgrade picked after the last lap isn't in the driven lap's state yet, so it's added here. */
function ownedAfter(owned: number, lines: LapLine[]): number {
  const picked = lines.at(-1)?.upgrade;
  return picked == null ? owned : owned | (1 << picked);
}
