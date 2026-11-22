'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { CornerDownLeft, ExternalLink, Play, ShieldCheck, TriangleAlert } from 'lucide-react';
import { CkbAmount, nameFor, PlayerFace, ShardCount, usePlayerBook } from '@/components/crowns/Board';
import { EASE } from '@/components/crowns/motion';
import { Button, buttonClass } from '@/components/ui/Button';
import { ChainLoader } from '@/components/ui/ChainLoader';
import { ClaimTrophy } from '@/components/rally/ClaimTrophy';
import { RallyReplay } from '@/components/rally/RallyReplay';
import { ckbWhole } from '@/hooks/useRallyStats';
import { getCkbClient } from '@/lib/ckb/client';
import { IMG } from '@/lib/crowns/art';
import { ckbTxExplorerUrl } from '@/lib/ckb/explorer';
import { CAR_COLORS } from '@/lib/rally/draw';
import { playsByTheseRules, readRaceRecord, replayRecord } from '@/lib/rally/result';
import { loadRally, mapName, RALLY } from '@/lib/rally/rules';
import { raceOf } from '@/lib/rally/stats';

function short(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

function clock(ticks: number): string {
  const seconds = ticks / RALLY.TICK_HZ;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}

const CKB = 100_000_000n;

function Label({ children, className = '' }: { children: string; className?: string }) {
  return <p className={`font-display text-sm font-extrabold uppercase tracking-wider text-fog ${className}`}>{children}</p>;
}

/**
 * How a finished race came out: places, times, shards and who was paid. The places come from
 * replaying the moves stored in the finish transaction, right here in the browser, with the same
 * rules the chain ran; the payouts come from the transaction's outputs. The two have to agree.
 */
export function RallyResults({ txHash, me }: { txHash: string; me: string | null }) {
  const book = usePlayerBook();
  const [watching, setWatching] = useState(false);
  const result = useQuery({
    queryKey: ['race-result', txHash],
    queryFn: async () => {
      const client = getCkbClient();
      const race = await raceOf(client, txHash);
      if (!race) return null;
      // A race run on older rules can't be replayed with these: it would make up places and shards.
      const sameRules = playsByTheseRules(race.game);
      if (!sameRules) return { race, sameRules, replayed: null, bytes: 0, record: null };
      const [record, runner] = await Promise.all([readRaceRecord(client, txHash, race.map), loadRally()]);
      const replayed = record ? replayRecord(runner, record) : null;
      return { race, sameRules, replayed, bytes: record?.length ?? 0, record };
    },
    staleTime: Infinity,
  });

  if (result.isPending) return <ChainLoader compact title="Loading the race…" />;
  if (!result.data) {
    return (
      <div className="mt-4 max-w-2xl">
        <div className="relative isolate h-[200px] overflow-hidden rounded-3xl sm:h-[280px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={IMG.refund} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/20 to-transparent" />
        </div>
        <h1 className="relative -mt-10 font-display text-[52px] font-black uppercase leading-[0.85] sm:text-[80px]">
          Race closed.
          <br />
          <span className="text-lime">Entries went home.</span>
        </h1>
        <p className="mt-5 text-lg text-chalk/85">The lobby closed without a race, so everyone got their money back. Nothing was lost.</p>
        <a className="mt-4 inline-flex items-center gap-2 font-mono text-sm text-fog hover:text-lime" href={ckbTxExplorerUrl(txHash)} target="_blank" rel="noreferrer">
          View receipt · {short(txHash)} <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
        <div className="mt-8">
          <Link href="/rally" className={buttonClass('lime', 'xl')}>
            Find another race
          </Link>
        </div>
      </div>
    );
  }

  const { race, sameRules, replayed, bytes, record } = result.data;
  const paidOwners = new Set(race.winners.map((winner) => winner.owner));
  const replayOwners = new Set((replayed?.winners ?? []).map((car) => race.players[car]));
  const agrees = Boolean(replayed) && paidOwners.size === replayOwners.size && [...paidOwners].every((owner) => replayOwners.has(owner));
  const order = race.players.map((_, car) => car).sort((a, b) => (replayed?.cars[a]?.place ?? a) - (replayed?.cars[b]?.place ?? b));
  const nameOf = (owner: string) => (owner === me ? 'You' : nameFor(book, owner));
  const iWon = Boolean(me && race.winners.some((winner) => winner.owner === me));
  const refunded = race.winners.length === 0;
  const timeOf = (car: number) => {
    const row = replayed?.cars[car];
    return row ? (row.finishTick != null ? clock(row.finishTick) : 'DNF') : '—';
  };
  if (watching && record) {
    return <RallyReplay record={record} map={race.map} names={race.players.map(nameOf)} follow={Math.max(0, order[0] ?? 0)} onClose={() => setWatching(false)} />;
  }
  // The top three, laid out 2nd, 1st, 3rd like a real podium.
  const podium = refunded ? [] : [1, 0, 2].filter((i) => i < order.length);

  return (
    <div className="mt-4">
      <p className="font-display text-lg font-extrabold uppercase text-lime">
        {mapName(race.map)} · {race.players.length} cars · Finished
        {race.endedMs ? ` · ${new Date(race.endedMs).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
      </p>
      <motion.h1
        initial={{ opacity: 0, x: -32 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="mt-2 font-display text-[52px] font-black uppercase leading-[0.85] sm:text-[96px]"
      >
        {refunded ? 'Nobody finished.' : iWon ? 'You won.' : `${nameOf(race.winners[0]!.owner)} won.`}
        <br />
        {refunded ? (
          <span className="text-lime">{race.prize && race.prize !== '0' ? 'The prize went back to the sponsor.' : 'Entries went home.'}</span>
        ) : (
          <span className="text-gold">
            <CkbAmount value={Number(BigInt(race.pot) / CKB)} /> paid.
          </span>
        )}
      </motion.h1>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        <div className="min-w-0">
          {podium.length > 0 ? (
            <div className={`grid items-end gap-2 sm:gap-4 ${podium.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {podium.map((i) => {
                const car = order[i]!;
                const owner = race.players[car]!;
                const place = i + 1;
                const height = place === 1 ? 'h-40 sm:h-52' : place === 2 ? 'h-28 sm:h-36' : 'h-20 sm:h-24';
                const tone = place === 1 ? 'bg-gold' : place === 2 ? 'bg-chalk/85' : 'bg-pink';
                return (
                  <motion.div
                    key={car}
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: EASE, delay: [0.2, 0.1, 0][i] }}
                    className="flex min-w-0 flex-col items-center"
                  >
                    <PlayerFace player={book.get(owner)} fallback={owner} size={place === 1 ? 96 : 68} tone={CAR_COLORS[car % CAR_COLORS.length]} />
                    <p className="mt-3 w-full truncate text-center font-display text-lg font-extrabold sm:text-2xl">{nameOf(owner)}</p>
                    {replayed ? <p className="font-display text-lg font-black tabular-nums text-chalk/80">{timeOf(car)}</p> : null}
                    <div className={`mt-3 flex w-full justify-center rounded-t-2xl pt-2 text-ink ${height} ${tone}`}>
                      <span className="font-display text-5xl font-black sm:text-7xl">{place}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : null}

          <div className={podium.length > 0 ? 'mt-8' : ''}>
            <div className="grid grid-cols-[2rem_1fr_auto_auto_auto] gap-x-4 border-b border-line pb-2">
              <Label>#</Label>
              <Label>Racer</Label>
              <Label className="text-right">Time</Label>
              <Label className="text-right">Shards</Label>
              <Label className="text-right">Moves</Label>
            </div>
            <ul className="divide-y divide-line">
              {order.map((car, i) => {
                const owner = race.players[car]!;
                const player = book.get(owner);
                const row = replayed?.cars[car];
                const share = race.winners.find((winner) => winner.owner === owner)?.share;
                const who = (
                  <>
                    <PlayerFace player={player} fallback={owner} size={36} tone={CAR_COLORS[car % CAR_COLORS.length]} />
                    <span className="min-w-0">
                      <span className="block truncate font-display text-xl font-extrabold leading-tight">{nameOf(owner)}</span>
                      {share ? <span className="block font-display text-sm font-extrabold text-gold">+{ckbWhole(share)} CKB</span> : null}
                      {refunded ? (
                        <span className="flex items-center gap-1 font-display text-sm font-extrabold text-lime">
                          <CornerDownLeft className="h-3.5 w-3.5" aria-hidden="true" /> Entry back
                        </span>
                      ) : null}
                    </span>
                  </>
                );
                return (
                  <li key={car} className="grid grid-cols-[2rem_1fr_auto_auto_auto] items-center gap-x-4 py-3">
                    <span className="font-display text-2xl font-black text-fog">{row && !row.finished ? '–' : i + 1}</span>
                    {player ? (
                      <Link href={`/profile/${encodeURIComponent(player.address)}`} className="flex min-w-0 items-center gap-3 transition-colors duration-150 hover:text-lime">
                        {who}
                      </Link>
                    ) : (
                      <span className="flex min-w-0 items-center gap-3">{who}</span>
                    )}
                    <span className="text-right font-display text-xl font-black tabular-nums">{timeOf(car)}</span>
                    <span className="flex items-center justify-end font-display text-xl font-black">{row ? <ShardCount value={row.shards} /> : '—'}</span>
                    <span className="text-right font-display text-xl font-black tabular-nums text-chalk/80">{row ? row.moves : '—'}</span>
                  </li>
                );
              })}
            </ul>
            {replayed ? <p className="mt-4 text-sm text-fog">Moves: how many times each driver changed what they were pressing. Each player’s moves are their own and can’t be faked.</p> : null}
            {refunded ? <p className="mt-4 text-fog">Nobody finished 3 laps, so everyone got their money back. Nothing was lost.</p> : null}
          </div>
        </div>

        <div className="space-y-5">
          {me && replayed && agrees && iWon ? (
            <ClaimTrophy race={race} ticks={replayed.cars[race.players.indexOf(me)]?.finishTick ?? replayed.ticks} />
          ) : null}

          <div className={`rounded-3xl border p-6 ${agrees ? 'border-lime/40 bg-lime/[0.06]' : sameRules ? 'border-gold/40 bg-gold/[0.06]' : 'border-line bg-ink-2'}`}>
            <div className="flex items-center gap-3">
              {agrees ? (
                <ShieldCheck className="h-7 w-7 shrink-0 text-lime" aria-hidden="true" />
              ) : (
                <TriangleAlert className={`h-7 w-7 shrink-0 ${sameRules ? 'text-gold' : 'text-fog'}`} aria-hidden="true" />
              )}
              <p className="font-display text-2xl font-black uppercase leading-none">
                {agrees ? 'Verified result' : !sameRules ? 'Raced on older rules' : replayed ? 'Replay disagrees' : 'Couldn’t replay here'}
              </p>
            </div>
            <p className="mt-3 text-chalk/85">
              {agrees
                ? `The chain replayed every signed move before paying. Your browser read the moves (${bytes.toLocaleString('en-US')} bytes) from the finish, replayed all ${replayed!.ticks.toLocaleString('en-US')} ticks too, and got the same ${refunded ? 'result: nobody finished' : 'winner'}.`
                : !sameRules
                  ? 'This race ran on an earlier version of the rules than this site has now, so your browser can’t replay it exactly. The payout is read straight from the chain.'
                  : 'This race was already checked before it paid out, so the result stands. This browser may just have different rules.'}
            </p>
            {record && replayed ? (
              <Button variant="lime" size="lg" block className="mt-5" onClick={() => setWatching(true)}>
                <Play className="h-5 w-5" aria-hidden="true" /> Watch the replay
              </Button>
            ) : null}
            <a className="mt-4 inline-flex items-center gap-2 font-mono text-sm text-lime hover:underline" href={ckbTxExplorerUrl(txHash)} target="_blank" rel="noreferrer">
              View receipt · {short(txHash)} <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>

          <Link href="/rally" className={buttonClass('lime', 'lg', true)}>
            Race again
          </Link>
        </div>
      </div>
    </div>
  );
}
