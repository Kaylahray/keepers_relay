'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { ccc } from '@ckb-ccc/connector-react';
import { AlertTriangle, ArrowLeft, Check, Globe, Search, UserPlus } from 'lucide-react';
import { ChainLoader } from '@/components/arena/ChainLoader';
import { Avatar } from '@/components/duel/Avatar';
import { Button } from '@/components/ui/Button';
import { Ckb, ChoiceChip, Stepper } from '@/components/ui/kit';
import { ART } from '@/lib/art';
import { loadAvatarSpore } from '@/hooks/usePublicProfile';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';
import { listBuilders } from '@/lib/api/keeperApi';
import { getCkbClient } from '@/lib/ckb/client';
import { newSessionKey } from '@/lib/crown/chain';
import { openDuel } from '@/lib/duel/chain';
import { artilleryTimer, KIND_ARTILLERY, KIND_RACE, MIN_RACE_MS, type DuelKind } from '@/lib/duel/codec';
import { rememberPendingKey, saveDuelKey } from '@/lib/duel/keys';
import { duelsConfigured } from '@/lib/registry/config';

const CKB = 100_000_000n;
const STAKES = [10, 25, 50, 100];
const TIMERS = [
  { ms: 30_000, label: '30s', hint: 'Fast' },
  { ms: 60_000, label: '1 min', hint: 'Normal' },
  { ms: 120_000, label: '2 min', hint: 'Relaxed' },
];
/** Under Pressure each turn is this much shorter than the last, down to 30 seconds. */
const PRESSURE_SHRINK_MS = 5_000;
/** Roughly what the duel cell needs for its own storage, returned to the challenger at the end. */
const DEPOSIT_CKB: Record<DuelKind, number> = { [KIND_ARTILLERY]: 442, [KIND_RACE]: 336 };

type Opponent = { address: string; name: string } | null;

/** Set up a challenge: the game, who, the stake and the turn timer, then lock your stake on chain. */
export function NewDuelView() {
  const router = useRouter();
  const params = useSearchParams();
  const signer = ccc.useSigner();
  const { isConnected, address } = useWallet();
  const { username } = useUsername();
  const players = useQuery({ queryKey: ['builders', 'roster'], queryFn: listBuilders });
  const [kind, setKind] = useState<DuelKind>(params.get('game') === 'race' ? KIND_RACE : KIND_ARTILLERY);
  const [stake, setStake] = useState(25);
  const [timerMs, setTimerMs] = useState(60_000);
  const [pressure, setPressure] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const vs = params.get('vs');
  const [picked, setPicked] = useState<Opponent | undefined>(undefined);
  // A link that already names the game (and the opponent) starts past those steps.
  const [step, setStep] = useState(params.get('game') ? (vs ? 2 : 1) : 0);

  const roster = useMemo(
    () =>
      (players.data ?? [])
        .filter((player) => player.username)
        .map((p) => ({ address: p.address, name: `@${p.username}`, sporeId: p.avatarSporeId ?? null })),
    [players.data],
  );
  const preset = vs ? (roster.find((p) => p.address.toLowerCase() === vs.toLowerCase()) ?? { address: vs, name: `${vs.slice(0, 8)}…` }) : null;
  const opponent: Opponent = picked === undefined ? preset : picked;
  const mySporeId = (players.data ?? []).find((p) => p.address.toLowerCase() === address?.toLowerCase())?.avatarSporeId ?? null;
  const opponentSporeId = opponent ? (roster.find((p) => p.address.toLowerCase() === opponent.address.toLowerCase())?.sporeId ?? null) : null;
  const shown = roster.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase().replace(/^@/, ''))).slice(0, 8);
  const lookalikes = shown.some((a) => shown.some((b) => a !== b && (b.name.startsWith(a.name) || a.name.startsWith(b.name))));
  const me = username?.username ? `@${username.username}` : 'You';
  const pot = stake * 2;

  async function send() {
    if (!signer) {
      setError('Connect your wallet to send a challenge.');
      return;
    }
    setError(null);
    try {
      const client = getCkbClient();
      setBusy('Preparing your challenge…');
      const opponentLockHash = opponent ? (await ccc.Address.fromString(opponent.address, client)).script.hash() : null;
      const session = await newSessionKey(client);
      rememberPendingKey(session.secret);
      setBusy('Approve in your wallet to lock your stake…');
      const opened = await openDuel(signer, {
        kind,
        stake: BigInt(stake) * CKB,
        timerMs: kind === KIND_RACE ? BigInt(MIN_RACE_MS) : artilleryTimer(timerMs, pressure ? PRESSURE_SHRINK_MS : 0),
        opponentLockHash,
        session,
      });
      saveDuelKey(opened.duelId, session.secret);
      router.push(`/duels/${opened.duelId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The challenge could not be sent.');
      setBusy(null);
    }
  }

  const steps = ['Game', 'Opponent', 'Stake', kind === KIND_ARTILLERY ? 'Timer' : 'Race'];
  const timerLabel = TIMERS.find((t) => t.ms === timerMs)?.label ?? `${timerMs / 1000}s`;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-6 md:px-8 md:pt-12">
      <button
        type="button"
        onClick={() => (step ? setStep(step - 1) : router.push('/duels'))}
        className="mb-6 inline-flex h-10 items-center gap-2 text-sm font-semibold text-mute hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
      </button>
      <h1 className="font-poster text-3xl font-black uppercase md:text-5xl">
        New <span className="text-pink">challenge</span>
      </h1>

      {step < 4 ? (
        <div className="mt-8">
          <Stepper steps={steps} current={step} tone="pink" onJump={setStep} />
        </div>
      ) : null}

      <div className="mt-8 min-h-[320px]">
        {step === 0 ? (
          <fieldset>
            <legend className="font-poster text-lg font-bold uppercase">Pick the game</legend>
            <div role="radiogroup" className="mt-4 grid gap-4 sm:grid-cols-2">
              {[
                { id: KIND_ARTILLERY as DuelKind, name: 'Artillery', body: 'Two tanks take turns firing over a stone tower. Angle, power and wind.', img: ART.artillery },
                { id: KIND_RACE as DuelKind, name: 'Lane race', body: 'You both drive the same 5 laps. Higher score wins.', img: ART.laneRace },
              ].map((g) => (
                <ChoiceChip key={g.id} selected={kind === g.id} tone="pink" onClick={() => setKind(g.id)} className="overflow-hidden p-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.img} alt="" className="aspect-video w-full object-cover" />
                  <div className="p-4">
                    <p className="font-poster text-base font-bold uppercase">{g.name}</p>
                    <p className="mt-1 text-sm text-mute">{g.body}</p>
                  </div>
                </ChoiceChip>
              ))}
            </div>
          </fieldset>
        ) : null}

        {step === 1 ? (
          <fieldset>
            <legend className="font-poster text-lg font-bold uppercase">Pick your opponent</legend>
            <div role="radiogroup" className="mt-4 space-y-4">
              <ChoiceChip selected={opponent === null} tone="pink" onClick={() => setPicked(null)} className="flex w-full items-center gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border-2 border-dashed border-pink/60 text-pink">
                  <Globe className="h-6 w-6" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-semibold">Open challenge</span>
                  <span className="block text-sm text-mute">Anyone can take it. First to accept plays you.</span>
                </span>
              </ChoiceChip>

              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-mute" aria-hidden="true" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search players by @name"
                  aria-label="Search players"
                  className="h-14 w-full rounded-xl bg-ink-2 pl-12 pr-4 text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-pink"
                />
              </div>

              {lookalikes ? (
                <p className="flex items-start gap-2 rounded-xl bg-gold/10 p-3 text-sm text-gold">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  Some names look alike. Check the picture and address before you pick.
                </p>
              ) : null}

              <ul className="grid gap-2 sm:grid-cols-2">
                {shown.map((player) => {
                  const selected = opponent?.address.toLowerCase() === player.address.toLowerCase();
                  return (
                    <li key={player.address}>
                      <ChoiceChip selected={selected} tone="pink" onClick={() => setPicked(player)} className="flex w-full items-center gap-3 p-3">
                        <PlayerFace name={player.name} sporeId={player.sporeId} tone="#ff56f6" size={56} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{player.name}</span>
                          {/* Names can look alike (@hii, @hiii): the address tells them apart. */}
                          <span className="block truncate font-mono text-[11px] text-mute">
                            {player.address.slice(0, 10)}…{player.address.slice(-6)}
                          </span>
                        </span>
                        {selected ? (
                          <span className="grid h-6 w-6 place-items-center rounded-md bg-pink">
                            <Check className="h-4 w-4 text-ink" aria-hidden="true" />
                          </span>
                        ) : null}
                      </ChoiceChip>
                    </li>
                  );
                })}
              </ul>
              {!shown.length ? (
                <p className="rounded-xl bg-ink-2 p-5 text-center text-sm text-mute">{players.isLoading ? 'Loading players…' : `No players match “${search}”.`}</p>
              ) : null}
            </div>
          </fieldset>
        ) : null}

        {step === 2 ? (
          <fieldset>
            <legend className="font-poster text-lg font-bold uppercase">Pick the stake</legend>
            <p className="mt-1 text-sm text-mute">You both lock the same amount.</p>
            <div role="radiogroup" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STAKES.map((value) => (
                <ChoiceChip key={value} selected={stake === value} tone="pink" onClick={() => setStake(value)} className="text-center">
                  <span className="block font-poster text-3xl font-extrabold text-gold">{value}</span>
                  <span className="font-mono text-[10px] text-mute">CKB</span>
                  <span className="mt-2 block text-[11px] text-mute">wins {value * 2}</span>
                </ChoiceChip>
              ))}
            </div>
          </fieldset>
        ) : null}

        {step === 3 && kind === KIND_ARTILLERY ? (
          <div className="space-y-8">
            <fieldset>
              <legend className="font-poster text-lg font-bold uppercase">Turn timer</legend>
              <div role="radiogroup" className="mt-4 grid grid-cols-3 gap-3">
                {TIMERS.map((timer) => (
                  <ChoiceChip key={timer.ms} selected={timerMs === timer.ms} tone="pink" onClick={() => setTimerMs(timer.ms)} className="text-center">
                    <span className="block font-poster text-xl font-extrabold">{timer.label}</span>
                    <span className="text-[11px] text-mute">{timer.hint}</span>
                  </ChoiceChip>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="font-poster text-lg font-bold uppercase">Pace</legend>
              <div role="radiogroup" className="mt-4 grid gap-3 sm:grid-cols-2">
                <ChoiceChip selected={!pressure} tone="pink" onClick={() => setPressure(false)}>
                  <span className="block font-semibold">Classic</span>
                  <span className="mt-1 block text-sm text-mute">Every turn gets {timerLabel}.</span>
                </ChoiceChip>
                <ChoiceChip selected={pressure} tone="pink" onClick={() => setPressure(true)}>
                  <span className="block font-semibold">Pressure</span>
                  <span className="mt-1 block text-sm text-mute">Each turn is 5 seconds shorter than the last, never below 30 seconds.</span>
                </ChoiceChip>
              </div>
              <p className="mt-3 text-sm text-mute">Miss your turn and it passes to the other player.</p>
            </fieldset>
          </div>
        ) : null}

        {step === 3 && kind === KIND_RACE ? (
          <div>
            <p className="font-poster text-lg font-bold uppercase">Race length</p>
            <p className="mt-3 rounded-2xl bg-ink-2 p-5 text-sm text-mute">15 minutes for both of you: five laps of 24 seconds, each with a 3-minute window to seal.</p>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-6">
            <section aria-label="Duel summary" className="clip-panel relative overflow-hidden bg-ink-2 px-5 py-6 md:px-10 md:py-8">
              <div className="absolute inset-y-0 left-0 w-1/2 bg-lime/[0.06]" aria-hidden="true" />
              <div className="absolute inset-y-0 right-0 w-1/2 bg-pink/[0.06]" aria-hidden="true" />
              <div className="relative flex items-start gap-3">
                <Fighter name={me} sporeId={mySporeId} tone="#99ee2d" sub={address ? `${address.slice(0, 7)}…${address.slice(-4)}` : 'you'} />
                <div className="flex shrink-0 flex-col items-center pt-5">
                  <span className="font-poster text-3xl font-black italic text-white md:text-5xl">VS</span>
                  <span className="mt-2 font-mono text-[10px] text-mute">{stake} CKB each</span>
                </div>
                <Fighter
                  name={opponent ? opponent.name : 'Anyone'}
                  sporeId={opponentSporeId}
                  tone="#ff56f6"
                  sub={opponent ? `${opponent.address.slice(0, 7)}…${opponent.address.slice(-4)}` : 'open challenge'}
                  open={!opponent}
                />
              </div>
              <div className="relative mt-6 flex flex-col items-center gap-1 border-t border-white/10 pt-5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Winner takes</p>
                <Ckb value={pot} size="xl" />
              </div>
            </section>
            <dl className="divide-y divide-white/5 rounded-2xl bg-ink-2 px-5">
              {[
                ['Game', kind === KIND_ARTILLERY ? 'Artillery' : 'Lane race'],
                ['Timer', kind === KIND_ARTILLERY ? `${timerLabel} · ${pressure ? 'Pressure' : 'Classic'}` : '15 minutes · 5 laps'],
                ['You lock', `${stake} CKB stake`],
                ['Storage deposit', `About ${DEPOSIT_CKB[kind]} CKB · comes back when the duel ends`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4 py-3.5 text-sm">
                  <dt className="text-mute">{k}</dt>
                  <dd className="text-right font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>

      <div className="mt-8 flex justify-end">
        {step < 4 ? (
          <Button variant="pink" size="lg" onClick={() => setStep(step + 1)} className="w-full sm:w-auto">
            {step === 3 ? 'Review' : 'Next'}
          </Button>
        ) : (
          <div className="flex w-full flex-col items-stretch gap-2 sm:items-end">
            <Button variant="pink" size="xl" onClick={() => void send()} disabled={Boolean(busy) || !duelsConfigured()}>
              {isConnected ? 'Send challenge' : 'Connect to challenge'}
            </Button>
            <p className="text-center text-xs text-mute sm:text-right">One wallet approval. Cancel any time before they accept. A few CKB go to your play key and come back too.</p>
            {!duelsConfigured() ? <p className="text-center text-xs text-gold sm:text-right">Duels aren’t live on this network yet.</p> : null}
            {error ? <p className="text-center text-sm text-danger sm:text-right">{error}</p> : null}
          </div>
        )}
      </div>

      {busy ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/85 px-6 backdrop-blur-sm">
          <div className="clip-panel w-full max-w-sm bg-ink-2 px-6 py-10">
            <ChainLoader inline={false} compact title={busy} note={`${stake} CKB is going into the duel contract.`} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A player's own profile picture (the Spore they set), or their drawn face while it loads or if they have none. */
function PlayerFace({ name, sporeId, tone, size }: { name: string; sporeId: string | null; tone: string; size: number }) {
  const picture = useQuery({
    queryKey: ['avatar-spore', sporeId],
    enabled: Boolean(sporeId),
    queryFn: () => loadAvatarSpore(sporeId!),
    staleTime: Infinity,
  });
  return <Avatar name={name} tone={tone} size={size} src={picture.data?.imageUrl ?? null} />;
}

function Fighter({ name, sporeId, tone, sub, open = false }: { name: string; sporeId: string | null; tone: string; sub: string; open?: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
      {open ? (
        <span className="grid h-20 w-20 place-items-center rounded-[22px] border-2 border-dashed border-pink/60 text-pink">
          <UserPlus className="h-8 w-8" aria-hidden="true" />
        </span>
      ) : (
        <PlayerFace name={name} sporeId={sporeId} tone={tone} size={80} />
      )}
      <div className="min-w-0 text-center">
        <p className="truncate font-poster text-sm font-bold">{name}</p>
        <p className="font-mono text-[10px] text-mute">{sub}</p>
      </div>
    </div>
  );
}
