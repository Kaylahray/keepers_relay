'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { getCkbClient } from '@/lib/ckb/client';
import { ckbWhole } from '@/lib/crown/rooms';
import { loadLaneRunner } from '@/lib/game/lane-runner';
import { replayMatch, VerifyError, type MatchReplay, type StealCheck } from '@/lib/sudden-death/verify';

function short(hex: string, head = 10, tail = 6): string {
  if (hex.length <= head + tail + 1) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
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
      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
        ok ? 'border-[#99ee2d]/40 text-[#99ee2d]' : 'border-[#af2a3a]/60 bg-[#af2a3a]/15 text-[#ff8b98]'
      }`}
    >
      {ok ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

function StealRow({ steal, fee }: { steal: StealCheck; fee: bigint }) {
  return (
    <li className={`border-l-2 pl-4 ${steal.ok ? 'border-[#99ee2d]/50' : 'border-[#af2a3a]'}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-poster text-3xl uppercase leading-none text-white">
          Round {steal.round}
        </span>
        <span className="font-mono text-[11px] text-white/55">
          score <span className="text-white">{steal.score}</span> · replayed here{' '}
          <span className={steal.replayed === steal.score ? 'text-[#99ee2d]' : 'text-[#ff8b98]'}>
            {steal.replayed ?? '—'}
          </span>{' '}
          · {steal.moves} moves
        </span>
      </div>

      <p className="mt-1.5 font-mono text-[11px] text-white/70">
        pot <span className="text-[#e1bf47]">+{ckbWhole(fee)} CKB</span> → {ckbWhole(steal.potAfter)} CKB
        <span className="mx-2 text-white/25">|</span>
        clock <span className="text-[#af2a3a]">−{minutes(steal.cutMs)}</span>
        <span className="mx-2 text-white/25">|</span>
        crown → {short(steal.kingAfter, 8, 4)}
      </p>

      <p className="mt-1 font-mono text-[10px] text-white/35">{stamp(steal.deadlineAfter)} deadline</p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Rule ok={steal.runOk} label="run replayed, beats the crown" />
        <Rule ok={steal.roundOk} label="round +1" />
        <Rule ok={steal.potOk} label="pot +fee" />
        <Rule ok={steal.clockOk} label="clock cut" />
        <Rule ok={steal.immutableOk} label="game and fee unchanged" />
      </div>

      <a
        href={`https://pudge.explorer.nervos.org/transaction/${steal.txHash}`}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 inline-block font-mono text-[10px] text-white/35 underline decoration-white/20 hover:text-white/70"
      >
        {short(steal.txHash, 14, 8)}
      </a>
    </li>
  );
}

export function VerifyView({ initialTx }: { initialTx?: string }) {
  const [input, setInput] = useState(initialTx ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replay, setReplay] = useState<MatchReplay | null>(null);

  const run = useCallback(async (hash: string) => {
    const target = hash.trim();
    if (!target) return;
    setBusy(true);
    setError(null);
    setReplay(null);
    try {
      setReplay(await replayMatch(getCkbClient(), target, await loadLaneRunner()));
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
    // Start the replay off the synchronous effect body, and drop the result if the hash
    // changes underneath us — a slow chain walk must not land on a newer match.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) return run(initialTx);
    });
    return () => {
      cancelled = true;
    };
  }, [initialTx, run]);

  return (
    <ArenaStage backHref="/play" backLabel="Crowns">
      <h1 className="font-poster text-5xl uppercase leading-none text-white sm:text-7xl">
        Check the crown
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/65">
        Paste any transaction from a crown to replay it from the chain.
      </p>
      <p className="mt-2 max-w-2xl font-mono text-[11px] uppercase tracking-wider text-[#99ee2d]/80">
        Nothing here touches our server. It reads the chain directly, in your browser.
      </p>

      <form
        className="mt-8 flex max-w-3xl flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void run(input);
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          spellCheck={false}
          placeholder="0x… transaction hash"
          className="min-w-0 flex-1 border border-white/15 bg-black/40 px-4 py-3 font-mono text-sm text-white placeholder:text-white/25 focus:border-[#99ee2d]/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="bg-[#99ee2d] px-6 py-3 font-poster text-2xl uppercase leading-none text-[#111] disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Replay'}
        </button>
      </form>

      {error ? (
        <p className="mt-6 max-w-3xl border border-[#af2a3a]/60 bg-[#af2a3a]/10 px-4 py-3 text-sm text-[#ff8b98]">
          {error}
        </p>
      ) : null}

      {replay ? (
        <div className="mt-10 max-w-3xl">
          <div
            className={`border px-5 py-4 ${
              replay.ok
                ? 'border-[#99ee2d]/40 bg-[#99ee2d]/5'
                : 'border-[#af2a3a] bg-[#af2a3a]/10'
            }`}
          >
            <p className="font-poster text-4xl uppercase leading-none text-white">
              {replay.ok ? 'Every round checks out' : 'A round does not check out'}
            </p>
            <p className="mt-2 text-sm text-white/65">
              {replay.steals.length === 0
                ? 'This match opened and nobody has taken the crown yet.'
                : `${replay.steals.length} ${replay.steals.length === 1 ? 'crown' : 'crowns'} taken. ` +
                  (replay.ok
                    ? 'Every run replays to its score and every cut matches.'
                    : 'At least one steal broke a rule. That should be impossible on chain — please report it.')}
            </p>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 font-mono text-[11px] sm:grid-cols-3">
            <div>
              <dt className="text-white/40 uppercase tracking-wider">Status</dt>
              <dd className="text-white">{replay.live ? 'Live' : 'Closed or settled'}</dd>
            </div>
            <div>
              <dt className="text-white/40 uppercase tracking-wider">Entry fee</dt>
              <dd className="text-white">{ckbWhole(replay.fee)} CKB</dd>
            </div>
            <div>
              <dt className="text-white/40 uppercase tracking-wider">Pot</dt>
              <dd className="text-[#e1bf47]">{ckbWhole(replay.finalPot)} CKB</dd>
            </div>
            <div>
              <dt className="text-white/40 uppercase tracking-wider">Opened until</dt>
              <dd className="text-white/80">{stamp(replay.openedDeadline)}</dd>
            </div>
            <div>
              <dt className="text-white/40 uppercase tracking-wider">Deadline now</dt>
              <dd className="text-white/80">{stamp(replay.finalDeadline)}</dd>
            </div>
            <div>
              <dt className="text-white/40 uppercase tracking-wider">Clock lost</dt>
              <dd className="text-[#af2a3a]">
                −{minutes(Math.max(0, replay.openedDeadline - replay.finalDeadline))}
              </dd>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-white/40 uppercase tracking-wider">Game script (data hash, fixed at open)</dt>
              <dd className="break-all text-white/70">
                {replay.game}
                {replay.gameKnown ? '' : ' · not a game this page can replay'}
              </dd>
            </div>
          </dl>

          {replay.steals.length ? (
            <ol className="mt-8 space-y-6">
              {replay.steals.map((steal) => (
                <StealRow key={steal.txHash} steal={steal} fee={replay.fee} />
              ))}
            </ol>
          ) : null}

          <p className="mt-8 border-t border-white/10 pt-4 font-mono text-[10px] leading-relaxed text-white/35">
            Runs are replayed with the same rules the chain uses.
          </p>
        </div>
      ) : null}
    </ArenaStage>
  );
}
