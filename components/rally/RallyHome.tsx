'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ccc } from '@ckb-ccc/connector-react';
import { motion } from 'framer-motion';
import { Check, Gauge } from 'lucide-react';
import { CkbAmount, LatestRaces } from '@/components/crowns/Board';
import { EASE } from '@/components/crowns/motion';
import { OpenRaces, useOpenRaces } from '@/components/crowns/OpenRaces';
import { ArenaStage } from '@/components/ui/ArenaStage';
import { ChainLoader } from '@/components/ui/ChainLoader';
import { Button, buttonClass } from '@/components/ui/Button';
import { useWallet } from '@/hooks/useWallet';
import { getCkbClient } from '@/lib/ckb/client';
import { plainChainError } from '@/lib/ckb/errors';
import { newSessionKey } from '@/lib/chain/session';
import { MAP_IMG } from '@/lib/crowns/art';
import { rememberPendingKey, saveRallyKey } from '@/lib/rally/keys';
import { MAX_SEATS, MIN_SEATS, openMatch } from '@/lib/rally/chain';
import { WAIT_CHOICES } from '@/lib/rally/protocol';
import { MAPS } from '@/lib/rally/rules';

const CKB = 100_000_000n;
const ENTRIES = [10, 25, 50, 100];
const PRIZES = [50, 100, 250, 500];
/** Who pays: everyone puts in an entry, or the host sponsors a prize and joining is free. */
type Kind = 'entry' | 'sponsored';
const SEATS = Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => MIN_SEATS + i);

function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`font-display text-sm font-extrabold uppercase tracking-wider text-fog ${className}`}>{children}</p>;
}

/** A row of numbers to pick one from, with the picked one lit up in lime. */
function Segmented({ values, value, onChange, id, label }: { values: number[]; value: number; onChange: (v: number) => void; id: string; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="mt-3 grid grid-flow-col gap-1 rounded-2xl border border-line bg-ink-2 p-1">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`relative h-12 rounded-xl font-display text-2xl font-black transition-colors duration-150 ${value === v ? 'text-ink' : 'text-fog hover:text-chalk'}`}
        >
          {value === v ? <motion.span layoutId={`seg-${id}`} transition={{ duration: 0.2, ease: EASE }} className="absolute inset-0 rounded-xl bg-lime" /> : null}
          <span className="relative">{v}</span>
        </button>
      ))}
    </div>
  );
}

/** One of two big choices, side by side. */
function Choice({ on, onClick, title, note }: { on: boolean; onClick: () => void; title: string; note: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition-colors duration-150 ${on ? 'border-lime bg-lime/10' : 'border-line bg-ink-2 hover:border-fog'}`}
    >
      <span className={`font-display text-xl font-black uppercase ${on ? 'text-lime' : 'text-chalk'}`}>{title}</span>
      <span className="mt-1 block text-sm text-fog">{note}</span>
    </button>
  );
}

/** A yes-or-no setting, with what it means underneath. */
function Toggle({ on, onChange, label, note }: { on: boolean; onChange: (on: boolean) => void; label: string; note: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" checked={on} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-lime)]" />
      <span>
        <span className="font-semibold text-chalk">{label}</span>
        <span className="block text-sm text-fog">{note}</span>
      </span>
    </label>
  );
}

/** Crowns races: host a race, or join one that's open. */
export function RallyHome() {
  const router = useRouter();
  const signer = ccc.useSigner();
  const { isConnected } = useWallet();
  const [kind, setKind] = useState<Kind>('entry');
  const [entry, setEntry] = useState(25);
  const [prize, setPrize] = useState(100);
  // A sponsor may race their own race, or only watch.
  const [hostRaces, setHostRaces] = useState(false);
  const [seats, setSeats] = useState(4);
  // Minutes until the race starts, from when the match lands.
  const [wait, setWait] = useState(10);
  const [map, setMap] = useState<number>(MAPS[0].id);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { configured, open } = useOpenRaces();
  const sponsored = kind === 'sponsored';
  const putIn = sponsored ? prize : entry;

  async function host() {
    if (!signer) {
      setError('Sign in to host a race.');
      return;
    }
    setError(null);
    try {
      setBusy('Preparing your race…');
      const racing = !sponsored || hostRaces;
      const session = racing ? await newSessionKey(getCkbClient()) : null;
      if (session) rememberPendingKey(session.secret);
      setBusy(sponsored ? 'Confirm your prize…' : 'Confirm your entry fee…');
      const opened = await openMatch(signer, {
        entry: sponsored ? 0n : BigInt(entry) * CKB,
        prize: sponsored ? BigInt(prize) * CKB : 0n,
        // A prize race is always names-only, so one person can't take every seat.
        namesOnly: sponsored,
        seats,
        map,
        session,
        wait: wait * 60,
      });
      if (session) saveRallyKey(opened.matchId, session.secret);
      router.push(`/rally/${opened.matchId}`);
    } catch (cause) {
      setError(plainChainError(cause, 'The race could not be opened.'));
      setBusy(null);
    }
  }

  return (
    <ArenaStage>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <motion.h1
          initial={{ opacity: 0, x: -32 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="font-display text-[64px] font-black uppercase leading-[0.85] sm:text-[96px]"
        >
          Race
        </motion.h1>
        <Link href="/rally/practice" className={buttonClass('ghost', 'md')}>
          <Gauge className="h-5 w-5" aria-hidden="true" /> Practice for free
        </Link>
      </div>

      <div className="mt-10 grid gap-14 lg:grid-cols-[1.25fr_1fr] lg:gap-12">
        <section aria-labelledby="host">
          <h2 id="host" className="font-display text-4xl font-black uppercase">
            Host a race
          </h2>
          <Label className="mt-6">Who pays?</Label>
          <div role="radiogroup" aria-label="Who pays?" className="mt-3 grid gap-3 sm:grid-cols-2">
            <Choice on={!sponsored} onClick={() => setKind('entry')} title="Everyone puts in" note="Each driver puts in the same entry. The winner takes the pot." />
            <Choice on={sponsored} onClick={() => setKind('sponsored')} title="I sponsor the prize" note="You put up the prize. Drivers join free. The winner takes the prize." />
          </div>

          <Label className="mt-6">Track</Label>
          <ul
            role="radiogroup"
            aria-label="Track"
            className="-mx-5 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0"
          >
            {MAPS.map((option) => {
              const on = map === option.id;
              return (
                <li key={option.id} className="w-[64%] shrink-0 snap-start sm:w-auto">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setMap(option.id)}
                    className={`group relative block aspect-[3/4] w-full overflow-hidden rounded-3xl text-left transition-[box-shadow] duration-150 ${on ? 'shadow-[0_0_0_3px_var(--color-lime)]' : ''}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={MAP_IMG[option.id]}
                      alt=""
                      className={`absolute inset-0 h-full w-full object-cover transition-[transform,filter] duration-300 ease-snap group-hover:scale-[1.04] ${on ? '' : 'brightness-[0.6] saturate-[0.7]'}`}
                    />
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 to-transparent" />
                    {on ? (
                      <motion.span
                        layoutId="track-check"
                        transition={{ duration: 0.22, ease: EASE }}
                        className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-lime text-ink"
                      >
                        <Check className="h-5 w-5" strokeWidth={3.5} aria-hidden="true" />
                      </motion.span>
                    ) : null}
                    <span className="absolute inset-x-0 bottom-0 p-4 font-display text-3xl font-black uppercase leading-[0.9]">{option.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-fog">{MAPS.find((option) => option.id === map)?.about}</p>

          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            <div>
              <Label>Seats</Label>
              <Segmented values={SEATS} value={seats} onChange={setSeats} id="seats" label="Seats" />
            </div>
            {sponsored ? (
              <div>
                <Label>Prize (CKB)</Label>
                <Segmented values={PRIZES} value={prize} onChange={setPrize} id="prize" label="Prize in CKB" />
              </div>
            ) : (
              <div>
                <Label>Entry (CKB)</Label>
                <Segmented values={ENTRIES} value={entry} onChange={setEntry} id="entry" label="Entry in CKB" />
              </div>
            )}
          </div>

          {sponsored ? (
            <div className="mt-8 grid gap-4">
              <Toggle
                on={hostRaces}
                onChange={setHostRaces}
                label="I’ll race too"
                note={hostRaces ? 'You take one of the seats. If you win, the prize comes back to you.' : 'You only watch. Every seat goes to other drivers.'}
              />
              <div>
                <p className="font-bold text-chalk">Only players with a username can join</p>
                <p className="text-sm text-fog">So one person can’t fill your race with many wallets and take the prize.</p>
              </div>
            </div>
          ) : null}

          <div className="mt-8">
            <Label>Race starts in (minutes)</Label>
            <Segmented values={[...WAIT_CHOICES]} value={wait} onChange={setWait} id="wait" label="Race starts in, in minutes" />
            <p className="mt-2 text-sm text-fog">
              Counted from when your race lands on chain. Each player who joins takes a fifth off the time left, down to 2 minutes. The race starts for everyone at once when the clock runs out.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-5 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-fog">{sponsored ? 'The winner takes' : 'A full race pays the winner'}</p>
              <p className="font-display text-5xl font-black leading-none text-gold">
                <CkbAmount value={sponsored ? prize : entry * seats} />
              </p>
              <p className="mt-2 text-sm text-fog">
                {sponsored
                  ? 'Your storage deposit comes back after the race. If nobody finishes, or too few join, the prize comes back too.'
                  : 'If nobody joins, your entry comes back.'}
              </p>
            </div>
            <Button size="xl" onClick={() => void host()} disabled={Boolean(busy) || !configured} className="w-full sm:w-auto" block>
              {isConnected ? (sponsored ? `Sponsor – put ${prize} CKB in` : `Host – put ${entry} CKB in`) : 'Connect to host'}
            </Button>
          </div>
          {!configured ? <p className="mt-3 text-gold">Crowns isn’t live on this network yet. Practice is.</p> : null}
          {error ? (
            <p role="alert" className="mt-3 text-danger">
              {error}
            </p>
          ) : null}
        </section>

        <section aria-labelledby="open" className="lg:sticky lg:top-28 lg:self-start">
          <div className="flex items-baseline justify-between">
            <h2 id="open" className="font-display text-4xl font-black uppercase">
              Open races
            </h2>
            {open.length > 0 ? <span className="text-fog">{open.length} open</span> : null}
          </div>
          <OpenRaces />
        </section>
      </div>

      <section aria-labelledby="finished" className="mt-16">
        <h2 id="finished" className="font-display text-4xl font-black uppercase">
          Finished races
        </h2>
        <p className="mb-4 mt-1 text-fog">Open one to see the places, each driver’s moves, and a full replay.</p>
        <LatestRaces limit={15} />
      </section>

      {busy ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/85 px-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-line bg-ink-2 px-6 py-10">
            <ChainLoader inline={false} compact title={busy} note={`${putIn} CKB is going into the race.`} />
          </div>
        </div>
      ) : null}
    </ArenaStage>
  );
}
