'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, Play, X } from 'lucide-react';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { ChainLoader } from '@/components/arena/ChainLoader';
import { Button } from '@/components/ui/Button';
import { ART } from '@/lib/art';
import { DuelVerify } from '@/components/duel/DuelVerify';
import { RunPlayback } from '@/components/game/RunPlayback';
import { duelIdOf, replayDuel, type DuelReplay } from '@/lib/duel/verify';
import { getCkbClient } from '@/lib/ckb/client';
import { ckbWhole } from '@/lib/crown/rooms';
import { loadLaneRunner } from '@/lib/game/lane-runner';
import { chainNames } from '@/lib/registry/chain-names';
import { replayMatch, VerifyError, type MatchReplay, type StealCheck } from '@/lib/sudden-death/verify';

function short(hex: string, head = 10, tail = 6): string {
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

/** A king as a reader knows them: their on-chain username, or else the start of their lock hash. */
function who(names: Map<string, string>, lockHash: string): string {
  const name = names.get(lockHash.toLowerCase());
  return name ? `@${name}` : short(lockHash, 8, 4);
}

function minutes(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(ms % 60_000 === 0 ? 0 : 1)} min`;
  return `${Math.round(ms / 1000)}s`;
}

function stamp(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function Rule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider ${
        ok ? 'bg-lime/15 text-lime' : 'bg-danger/15 text-danger'
      }`}
    >
      {ok ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

function StealRow({ steal, fee, names }: { steal: StealCheck; fee: bigint; names: Map<string, string> }) {
  const [watching, setWatching] = useState(false);
  return (
    <li className={`rounded-2xl p-4 md:p-5 ${steal.ok ? 'bg-ink-2' : 'bg-danger/10'}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-poster text-lg font-black uppercase">
          Round {steal.round} · {who(names, steal.kingAfter)}
        </span>
        <span className="font-mono text-[11px] text-mute">
          score <span className="text-white">{steal.score}</span> · replayed here{' '}
          <span className={steal.replayed === steal.score ? 'text-lime' : 'text-danger'}>
            {steal.replayed ?? 'older build'}
          </span>{' '}
          · {steal.moves} moves
        </span>
      </div>

      <p className="mt-1.5 font-mono text-[11px] text-white/80">
        pot <span className="text-gold">+{ckbWhole(fee)} CKB</span> → {ckbWhole(steal.potAfter)} CKB
        <span className="mx-2 text-white/25">|</span>
        clock <span className="text-danger">−{minutes(steal.cutMs)}</span>
        <span className="mx-2 text-white/25">|</span>
        crown → {who(names, steal.kingAfter)}
      </p>

      <p className="mt-1 font-mono text-[10px] text-mute">{stamp(steal.deadlineAfter)} deadline</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Rule ok={steal.runOk} label={steal.replayed == null ? 'beats the crown (older game build, replayed by the chain only)' : 'run replayed, beats the crown'} />
        <Rule ok={steal.roundOk} label="round +1" />
        <Rule ok={steal.potOk} label="pot +fee" />
        <Rule ok={steal.clockOk} label="clock cut" />
        <Rule ok={steal.immutableOk} label="game and fee unchanged" />
        {steal.onTime != null ? (
          <Rule ok={steal.onTime} label={steal.onTime ? 'landed in time' : 'landed late or too slow, cannot win'} />
        ) : null}
        {steal.onTime != null ? <Rule ok={steal.certifyOk} label="postmark recorded" /> : null}
      </div>

      {steal.run ? (
        watching ? (
          <div className="mt-3">
            <RunPlayback run={steal.run} title={`${who(names, steal.kingAfter)}'s winning run`} />
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => setWatching(true)}>
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" /> Watch this run
          </Button>
        )
      ) : null}

      <a
        href={`https://pudge.explorer.nervos.org/transaction/${steal.txHash}`}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] text-pink hover:text-white"
      >
        {short(steal.txHash, 14, 8)} <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </li>
  );
}

export function VerifyView({ initialTx }: { initialTx?: string }) {
  const [input, setInput] = useState(initialTx ?? '');
  // The transaction being checked, so its own round leads and the rest of the crown folds away.
  const [checked, setChecked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replay, setReplay] = useState<MatchReplay | null>(null);
  const [duel, setDuel] = useState<DuelReplay | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  const run = useCallback(async (hash: string) => {
    const target = hash.trim();
    setChecked(target.toLowerCase());
    if (!target) return;
    setBusy(true);
    setError(null);
    setReplay(null);
    setDuel(null);
    try {
      // A duel or a crown: whichever this transaction belongs to.
      if (await duelIdOf(getCkbClient(), target)) {
        setDuel(await replayDuel(getCkbClient(), target, await loadLaneRunner()));
        return;
      }
      const result = await replayMatch(getCkbClient(), target, await loadLaneRunner());
      setReplay(result);
      const kings = [...result.steals.map((steal) => steal.kingAfter), ...(result.winner ? [result.winner] : [])];
      void chainNames(getCkbClient(), kings)
        .then(setNames)
        .catch(() => undefined);
    } catch (caught) {
      setError(
        caught instanceof VerifyError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : 'The replay failed.',
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!initialTx) return;
    // Start the replay off the synchronous effect body, and drop the result if the hash changes underneath us — a slow chain walk must not land on a newer match.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) return run(initialTx);
    });
    return () => {
      cancelled = true;
    };
  }, [initialTx, run]);

  return (
    <ArenaStage>
      <p className="font-mono text-[11px] uppercase tracking-wider text-pink">Fair play</p>
      <h1 className="mt-1 font-poster text-3xl font-black uppercase md:text-5xl">Check a game</h1>
      <p className="mt-2 max-w-xl text-mute">
        Paste any game&apos;s transaction. We replay it from the chain and show you exactly what happened. Nothing here touches our server: it reads the chain
        directly, in your browser.
      </p>

      <form
        className="mt-8 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void run(input);
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          spellCheck={false}
          placeholder="Paste a game transaction (0x…)"
          aria-label="Game transaction"
          className="h-14 min-w-0 flex-1 rounded-xl bg-ink-2 px-4 font-mono text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-pink"
        />
        <Button type="submit" variant="pink" size="lg" disabled={busy || !input.trim()}>
          Check it
        </Button>
      </form>

      {error ? <p className="mt-6 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p> : null}

      {!busy && !error && !duel && !replay ? (
        <div className="mt-12 grid items-center gap-8 rounded-3xl bg-pink/10 p-6 md:grid-cols-2 md:p-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ART.fairPlay} alt="A robot referee reviewing a replay" className="rounded-2xl" />
          <div>
            <h2 className="font-poster text-xl font-black uppercase">Like a receipt for every game</h2>
            <p className="mt-3 text-mute">
              You&apos;ll see the game play back, a clear verdict, and every move with the block it landed in. Nothing to trust, everything to check.
            </p>
          </div>
        </div>
      ) : null}

      {busy ? (
        <div className="mt-12 rounded-3xl bg-ink-2">
          <ChainLoader compact title="Replaying the game from the chain…" note="Reading every move and running it again." />
        </div>
      ) : null}

      {duel ? <DuelVerify replay={duel} /> : null}

      {replay ? (
        <div className="mt-10 space-y-8">
          <section aria-live="polite" className={`clip-panel flex items-center gap-4 p-6 text-ink md:p-8 ${replay.ok ? 'bg-lime' : 'bg-danger'}`}>
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-ink">
              {replay.ok ? <Check className="h-8 w-8 text-lime" aria-hidden="true" /> : <X className="h-8 w-8 text-danger" aria-hidden="true" />}
            </span>
            <div>
            <h2 className="font-poster text-xl font-black uppercase md:text-3xl">
              {replay.ok ? 'Everything checks out' : 'Something does not check out'}
            </h2>
            <p className="mt-1 font-medium">
              {replay.steals.length === 0
                ? replay.live
                  ? 'This match opened and nobody has taken the crown yet.'
                  : 'Nobody took the crown, so the host got everything back.'
                : `${replay.steals.length} ${replay.steals.length === 1 ? 'crown' : 'crowns'} taken. ` +
                  (replay.ok
                    ? replay.gameKnown
                      ? 'Every run replays to its score and every cut matches.'
                      : 'Every pot and clock change matches. These runs used an older build of the game, which the chain replayed when each steal landed.'
                    : 'At least one steal broke a rule. That should be impossible on chain — please report it.')}
            </p>
            </div>
          </section>

          <h2 className="font-poster text-lg font-bold uppercase">What the chain shows</h2>

          <dl className="-mt-4 grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl bg-ink-2 p-5 font-mono text-[11px] sm:grid-cols-3">
            <div>
              <dt className="uppercase tracking-wider text-mute">Status</dt>
              <dd className="text-white">{replay.live ? 'Live' : 'Closed or settled'}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wider text-mute">Entry fee</dt>
              <dd className="text-white">{ckbWhole(replay.fee)} CKB</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wider text-mute">Prize</dt>
              <dd className="text-gold">{ckbWhole(replay.finalPot)} CKB</dd>
            </div>
            {replay.postmarked ? (
              <div>
                <dt className="uppercase tracking-wider text-mute">{replay.live ? 'Wins if closed now' : 'Prize went to'}</dt>
                <dd className="text-white">{replay.winner ? who(names, replay.winner) : 'Nobody, so the host'}</dd>
              </div>
            ) : null}
            <div>
              <dt className="uppercase tracking-wider text-mute">Opened until</dt>
              <dd className="text-white/80">{stamp(replay.openedDeadline)}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wider text-mute">Deadline now</dt>
              <dd className="text-white/80">{stamp(replay.finalDeadline)}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wider text-mute">Clock lost</dt>
              <dd className="text-danger">
                −{minutes(Math.max(0, replay.openedDeadline - replay.finalDeadline))}
              </dd>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <dt className="uppercase tracking-wider text-mute">Game script (data hash, fixed at open)</dt>
              <dd className="break-all text-white/70">
                {replay.game}
                {replay.gameKnown ? '' : ' · not a game this page can replay'}
              </dd>
            </div>
          </dl>

          {replay.steals.length ? (
            (() => {
              const mine = replay.steals.find((steal) => steal.txHash.toLowerCase() === checked) ?? null;
              const rest = mine ? replay.steals.filter((steal) => steal !== mine) : replay.steals;
              return (
                <>
                  {mine ? (
                    <section className="space-y-3">
                      <h2 className="font-poster text-lg font-bold uppercase">This transaction</h2>
                      <ol>
                        <StealRow steal={mine} fee={replay.fee} names={names} />
                      </ol>
                    </section>
                  ) : null}
                  {rest.length ? (
                    <details className="rounded-2xl bg-ink-2 p-4" open={!mine}>
                      <summary className="cursor-pointer font-poster text-sm font-bold uppercase">
                        {mine ? 'The rest of this crown · ' + rest.length + (rest.length === 1 ? ' more round' : ' more rounds') : 'Every round of this crown'}
                      </summary>
                      <ol className="mt-4 space-y-3">
                        {rest.map((steal) => (
                          <StealRow key={steal.txHash} steal={steal} fee={replay.fee} names={names} />
                        ))}
                      </ol>
                    </details>
                  ) : null}
                </>
              );
            })()
          ) : null}

          <p className="border-t border-white/10 pt-4 font-mono text-[10px] leading-relaxed text-mute">
            Runs are replayed with the same rules the chain uses.
          </p>
        </div>
      ) : null}
    </ArenaStage>
  );
}
