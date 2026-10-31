'use client';

import { useEffect, useMemo, useState } from 'react';
import { ccc } from '@ckb-ccc/connector-react';
import { Flag, Timer } from 'lucide-react';
import { LaneRunnerGame, type FinishedRun, type LapPlan } from '@/components/game/LaneRunnerGame';
import { useTick } from '@/components/duel/useDuels';
import { Button } from '@/components/ui/Button';
import { LapBoxes } from '@/components/ui/kit';
import { getCkbClient } from '@/lib/ckb/client';
import { raceLap, sealRaceLap, submitRace, type DuelSnapshot, type RaceLap } from '@/lib/duel/chain';
import { loadRaceRun, saveRaceRun, type RaceRun } from '@/lib/duel/race-run';
import { bytesToHex, hexToBytes, LAPS, runSeed } from '@/lib/sudden-death/codec';

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** One player's side of a lane race: play each lap on the road the chain reveals, seal it (no wallet), and hand the run in. */
export function RacePanel({
  snapshot,
  side,
  sessionKey,
  myLockHash,
  onMoved,
}: {
  snapshot: DuelSnapshot;
  side: 0 | 1;
  sessionKey: `0x${string}`;
  myLockHash: string;
  onMoved: () => void;
}) {
  const signer = ccc.useSigner();
  const duelId = snapshot.duelId;
  const [run, setRun] = useState<RaceRun>(() => loadRaceRun(duelId));
  const [lap, setLap] = useState<RaceLap | null>(null);
  const [best, setBest] = useState<(FinishedRun & { lap: number }) | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useTick(true, 500);
  const handedIn = run.handedIn || (snapshot.duel.submitted & (1 << side)) !== 0;
  const theirsIn = (snapshot.duel.submitted & (1 << (1 - side))) !== 0;
  const crashed = run.laps.at(-1)?.crashed ?? false;
  const done = run.laps.length >= LAPS || crashed;

  // The next lap's road, read from the chain: it only exists once the last seal has landed.
  useEffect(() => {
    if (handedIn || done) return;
    let stop = false;
    const read = async () => {
      const next = await raceLap(getCkbClient(), snapshot.point, sessionKey, myLockHash).catch(() => null);
      if (!stop) setLap(next);
    };
    void read();
    const id = window.setInterval(() => void read(), 3_000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [snapshot.point, sessionKey, myLockHash, handedIn, done]);

  const inSync = lap != null && lap.sealed === run.laps.length && !lap.late;
  const plan = useMemo<LapPlan | null>(() => {
    if (!inSync || !lap || done) return null;
    return {
      seeds: [...run.laps.map((l) => runSeed(duelId, myLockHash, l.block)), lap.seed],
      sealed: run.laps.map((l) => hexToBytes(l.tape)),
    };
  }, [inSync, lap, done, run.laps, duelId, myLockHash]);
  const current = run.laps.length + 1;
  const tryHere = best?.lap === current ? best : null;
  const windowLeft = lap && inSync ? lap.windowEndsMs - now : null;

  function remember(next: RaceRun) {
    saveRaceRun(duelId, next);
    setRun(next);
  }

  async function seal() {
    if (!tryHere || !lap) return;
    setError(null);
    setBusy(`Sealing lap ${current}…`);
    try {
      await sealRaceLap(getCkbClient(), snapshot.point, sessionKey, tryHere.tape);
      remember({
        ...run,
        laps: [...run.laps, { block: lap.block, tape: bytesToHex(tryHere.tape), score: tryHere.score, crashed: tryHere.crashed }],
      });
      setBest(null);
      setLap(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The lap could not be sealed.');
    } finally {
      setBusy(null);
    }
  }

  async function handIn() {
    if (!signer) return;
    setError(null);
    setBusy('Handing in your run…');
    try {
      const owner = (await signer.getRecommendedAddressObj()).script;
      await submitRace(
        getCkbClient(),
        snapshot.point,
        sessionKey,
        owner,
        run.laps.map((l) => ({ block: hexToBytes(l.block), tape: hexToBytes(l.tape) })),
        run.laps.at(-1)?.score ?? 0,
      );
      remember({ ...run, handedIn: true });
      onMoved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The run could not be handed in.');
    } finally {
      setBusy(null);
    }
  }

  const score = run.laps.at(-1)?.score ?? 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink-2 p-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Your laps</p>
          <div className="mt-2">
            <LapBoxes
              tone="pink"
              label="Your laps"
              states={Array.from({ length: LAPS }, (_, i) => {
                const sealed = run.laps[i];
                if (sealed) return sealed.crashed ? 'crash' : 'done';
                return i === run.laps.length && !done ? 'current' : 'empty';
              })}
              scores={run.laps.map((l) => l.score)}
            />
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Score</p>
          <p className="font-poster text-3xl font-black tabular-nums leading-none">{score}</p>
        </div>
      </div>

      {handedIn ? (
        <div className="clip-panel bg-ink-2 p-6">
          <p className="flex items-center gap-2 font-poster text-xl font-black uppercase">
            <Flag className="h-5 w-5 text-lime" /> Run handed in: {score}
          </p>
          <p className="mt-1 text-sm text-mute">
            {theirsIn ? 'Both runs are in. Collect below.' : 'Waiting for your opponent to finish their race.'}
          </p>
        </div>
      ) : done ? (
        <div className="clip-panel bg-ink-2 p-6 text-center">
          <p className="font-mono text-[11px] uppercase tracking-wider text-mute">All laps in</p>
          <p className="mt-2 font-poster text-4xl font-black tabular-nums">{score}</p>
          <p className="mt-2 text-sm text-mute">{crashed ? 'You crashed, so your race ends here.' : 'Every lap is sealed.'} Hand it in to be scored on chain.</p>
          <Button variant="pink" size="lg" onClick={() => void handIn()} disabled={Boolean(busy)} className="mt-6">
            {busy ?? 'Hand in my run'}
          </Button>
        </div>
      ) : (
        <>
          <LaneRunnerGame
            tone="pink"
            title="Lane race"
            sealLeftMs={plan ? windowLeft : null}
            seed={lap?.seed ?? 1n}
            toBeat={0}
            onFinish={(finished) =>
              setBest((cur) => (cur && cur.lap === current && cur.score >= finished.score ? cur : { ...finished, lap: current }))
            }
            startLabel={plan ? `Race lap ${current} of ${LAPS}` : 'Waiting for your road…'}
            lap={plan ?? undefined}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-mute">
              {!plan
                ? lap?.late
                  ? 'Your last lap was sealed too late, so your race stops here.'
                  : 'The chain is revealing your next road…'
                : tryHere
                  ? `Best try: ${tryHere.score}${tryHere.crashed ? ' (crashed: sealing it ends your race)' : ''}. Try again or seal it.`
                  : 'Race the lap. Try as often as you like, then seal your best.'}
            </p>
            {windowLeft != null ? (
              <p className={`flex items-center gap-1.5 font-mono text-xs font-bold uppercase ${windowLeft < 30_000 ? 'text-danger' : 'text-white'}`}>
                <Timer className="h-4 w-4" /> {clock(windowLeft)} to seal this lap
              </p>
            ) : null}
          </div>
          {tryHere && plan ? (
            <Button variant={tryHere.crashed ? 'danger' : 'pink'} size="lg" onClick={() => void seal()} disabled={Boolean(busy)} className="mt-3">
              {busy ?? (tryHere.crashed ? `Seal crash · ${tryHere.score} · ends race` : `Seal lap ${current} · ${tryHere.score}`)}
            </Button>
          ) : null}
          {lap?.late && run.laps.length > 0 ? (
            <Button variant="pink" size="lg" onClick={() => void handIn()} disabled={Boolean(busy)} className="mt-3">
              {busy ?? 'Hand in (scores 0)'}
            </Button>
          ) : null}
        </>
      )}
      {error ? <p className="mt-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
