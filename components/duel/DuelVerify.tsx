'use client';

import { useEffect, useState } from 'react';
import { Check, ExternalLink, X } from 'lucide-react';
import { ArtilleryReplay } from '@/components/duel/ArtilleryReplay';
import { Avatar } from '@/components/duel/Avatar';
import { SIDE_COLORS } from '@/components/duel/colors';
import { useChainPictures } from '@/components/duel/useChainPictures';
import { RunPlayback } from '@/components/game/RunPlayback';
import { getCkbClient } from '@/lib/ckb/client';
import type { DuelMove, DuelReplay } from '@/lib/duel/verify';
import { KIND_ARTILLERY } from '@/lib/duel/codec';
import { chainNames, nameOf } from '@/lib/registry/chain-names';

const EXPLORER = 'https://pudge.explorer.nervos.org';

function ckb(shannons: bigint): string {
  return (Number(shannons) / 1e8).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function windText(wind: number): string {
  return wind === 0 ? 'calm' : `${Math.abs(wind)} ${wind < 0 ? '←' : '→'}`;
}

/**
 * A duel checked from chain: played back first, like a video, then what the chain shows, rule by
 * rule, then every move with the block it landed in. Everything here was read from the chain.
 */
export function DuelVerify({ replay }: { replay: DuelReplay }) {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    void chainNames(getCkbClient(), [replay.challenger, replay.opponent])
      .then(setNames)
      .catch(() => undefined);
  }, [replay.challenger, replay.opponent]);
  const players: [string, string] = [nameOf(names, replay.challenger), nameOf(names, replay.opponent)];
  const [picture0, picture1] = useChainPictures([replay.challenger, replay.opponent]);
  const pictures: [string | null, string | null] = [picture0 ?? null, picture1 ?? null];
  const game = replay.kind === KIND_ARTILLERY ? 'Artillery' : 'Lane race';

  const outcome =
    replay.status === 'cancelled'
      ? 'Nobody accepted, so the challenger took their stake back.'
      : replay.status === 'open'
        ? 'Waiting for someone to accept.'
        : replay.status === 'live'
          ? 'Still being played.'
          : replay.winner === 'draw'
            ? 'A draw. Each player got their stake back.'
            : replay.winner !== null
              ? `${players[replay.winner]} won and was paid ${ckb(replay.stake * 2n)} CKB.`
              : 'Finished.';

  return (
    <div className="mt-10 space-y-8">
      {/* Who played, for what */}
      <div className="flex flex-wrap items-center gap-4">
        {([0, 1] as const).map((side) => (
          <div key={side} className={`flex items-center gap-3 ${side === 1 ? 'order-3' : ''}`}>
            <Avatar name={players[side]} tone={SIDE_COLORS[side]} size={44} src={pictures[side]} />
            <span className="font-poster text-lg font-bold">{players[side]}</span>
          </div>
        ))}
        <span className="order-2 font-poster text-xl font-black italic text-mute">VS</span>
        <span className="order-4 font-mono text-[11px] uppercase tracking-wider text-pink">
          {game} · {ckb(replay.stake)} CKB each
        </span>
      </div>

      {/* The game, played back from the chain's own records */}
      {replay.kind === KIND_ARTILLERY && replay.seed !== null && replay.shots.length > 0 ? (
        <ArtilleryReplay seed={replay.seed} shots={replay.shots} names={players} pictures={pictures} />
      ) : null}
      {replay.runs.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {replay.runs.map((run) => (
            <div key={run.txHash}>
              <p className="mb-2 font-poster text-base font-bold uppercase">
                {players[run.side]} · {String(run.score)} points
              </p>
              <RunPlayback run={{ laps: run.laps }} title={`${players[run.side]}'s five laps`} />
            </div>
          ))}
        </div>
      ) : null}

      {/* The verdict */}
      <section aria-live="polite" className={`clip-panel flex items-center gap-4 p-6 text-ink md:p-8 ${replay.ok ? 'bg-lime' : 'bg-danger'}`}>
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-ink">
          {replay.ok ? <Check className="h-8 w-8 text-lime" aria-hidden="true" /> : <X className="h-8 w-8 text-danger" aria-hidden="true" />}
        </span>
        <div>
          <h2 className="font-poster text-xl font-black uppercase md:text-3xl">{replay.ok ? 'Everything checks out' : 'Something does not check out'}</h2>
          <p className="mt-1 font-medium">{outcome}</p>
        </div>
      </section>

      {/* The rules, said plainly */}
      {replay.rules.length > 0 ? (
        <section aria-labelledby="shows">
          <h2 id="shows" className="font-poster text-lg font-bold uppercase">
            What the chain shows
          </h2>
          <ul className="mt-3 divide-y divide-white/5 rounded-2xl bg-ink-2 px-5">
            {replay.rules.map((rule) => (
              <li key={rule.text} className="flex gap-3 py-3">
                <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ${rule.ok ? 'bg-lime' : 'bg-danger'}`}>
                  {rule.ok ? <Check className="h-4 w-4 text-ink" aria-label="Checks out" /> : <X className="h-4 w-4 text-ink" aria-label="Does not check out" />}
                </span>
                <span className={rule.ok ? '' : 'font-semibold text-danger'}>{rule.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Move by move, each with the block it landed in */}
      {replay.moves.length > 0 ? (
        <section aria-labelledby="moves">
          <h2 id="moves" className="font-poster text-lg font-bold uppercase">
            Move by move
          </h2>
          <div className="mt-3 overflow-x-auto rounded-2xl bg-ink-2">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="font-mono text-[10px] uppercase tracking-wider text-mute">
                <tr>
                  {['Turn', 'Who', 'Angle', 'Power', 'Wind', 'Result', 'Block'].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {replay.moves.map((move) => (
                  <MoveRow key={move.turn} move={move} players={players} pictures={pictures} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="border-t border-white/10 pt-4 font-mono text-[10px] leading-relaxed text-mute">
        <p>Everything above was read from the chain, in your browser. Our server was not asked.</p>
        <p className="mt-1">CKB itself replayed this duel before any CKB moved: the payout would have been refused if it did not match the game.</p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <a className="inline-flex items-center gap-1 text-pink hover:text-white" href={`${EXPLORER}/transaction/${replay.openTx}`} target="_blank" rel="noreferrer">
            Challenge sent <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
          {replay.accept ? (
            <a className="inline-flex items-center gap-1 text-pink hover:text-white" href={`${EXPLORER}/transaction/${replay.accept.txHash}`} target="_blank" rel="noreferrer">
              Accepted <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          ) : null}
          {replay.payout ? (
            <a className="inline-flex items-center gap-1 text-pink hover:text-white" href={`${EXPLORER}/transaction/${replay.payout.txHash}`} target="_blank" rel="noreferrer">
              Paid out <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          ) : null}
        </p>
      </div>
    </div>
  );
}

function MoveRow({ move, players, pictures }: { move: DuelMove; players: [string, string]; pictures: [string | null, string | null] }) {
  const target = move.side === 0 ? 1 : 0;
  const hit = move.damage[target];
  const self = move.damage[move.side];
  const result = move.pass ? 'Turn skipped' : hit > 0 ? `Hit −${hit}${self > 0 ? ` (−${self} back)` : ''}` : self > 0 ? `Splash back −${self}` : 'Miss';
  return (
    <tr>
      <td className="px-4 py-3 font-mono">{move.turn + 1}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-2">
          <Avatar name={players[move.side]} tone={SIDE_COLORS[move.side]} size={24} src={pictures[move.side]} />
          {players[move.side]}
        </span>
      </td>
      <td className="px-4 py-3 font-mono">{move.pass ? '—' : `${move.angle <= 90 ? move.angle : 180 - move.angle}°`}</td>
      <td className="px-4 py-3 font-mono">{move.pass ? '—' : move.power}</td>
      <td className="px-4 py-3 font-mono">{windText(move.wind)}</td>
      <td className={`px-4 py-3 font-semibold ${hit > 0 ? 'text-lime' : move.pass ? 'text-mute' : 'text-white'}`}>{result}</td>
      <td className="px-4 py-3">
        <a href={`${EXPLORER}/transaction/${move.txHash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-pink hover:text-white">
          {move.block.number.toLocaleString('en-US')} <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </td>
    </tr>
  );
}
