'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { ChainLoader } from '@/components/arena/ChainLoader';
import { CrownCard } from '@/components/crown/CrownCard';
import { Button } from '@/components/ui/Button';
import { ChoiceChip, EmptyState, Stepper } from '@/components/ui/kit';
import { ART } from '@/lib/art';
import { useWallet } from '@/hooks/useWallet';
import { useUsername } from '@/hooks/useUsername';
import { useRequireUsername } from '@/hooks/useRequireUsername';
import { publishCrown } from '@/lib/crown/remote';
import { DEFAULT_DURATION_MS, FLOOR_CROWN, GAMES, saveCrown, sealCrown, type CrownRoom, type CrownSetup, type GameId } from '@/lib/crown/rooms';
import { registryConfigured } from '@/lib/registry/config';

const STEPS = ['Game', 'Entry fee', 'Clock', 'Title'] as const;
const FEES = [5, 10, 20, 50];
const CLOCKS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '6 hours', minutes: 360 },
];
const FIELD = 'w-full rounded-xl bg-ink-2 px-4 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-lime';
const MAX_MINUTES = 48 * 60;

function minutesOf(durationMs?: number): number {
  return Math.round((durationMs ?? DEFAULT_DURATION_MS) / 60_000);
}

export function OpenCrownView() {
  const router = useRouter();
  const duel = useSearchParams().get('duel');
  const { address, isConnected, isReady } = useWallet();
  const { username: onChainUsername, isLoading: nameLoading } = useUsername();
  // Sends a host with no username to /join, and saves a name claimed elsewhere to their profile.
  useRequireUsername();
  const [step, setStep] = useState(0);
  const [setup, setSetup] = useState<CrownSetup>(() => ({ ...FLOOR_CROWN, title: duel ? 'Duel' : 'Lane Runner crown' }));
  const [lengthText, setLengthText] = useState(() => String(minutesOf(FLOOR_CROWN.durationMs)));
  const [feeText, setFeeText] = useState(() => String(Number(FLOOR_CROWN.feeShannons / 100_000_000n)));
  const [shareError, setShareError] = useState<string | null>(null);
  const [sealing, setSealing] = useState(false);

  function commitLength(raw: string) {
    const minutes = Math.round(Number(raw));
    if (!raw.trim() || !Number.isFinite(minutes)) {
      setLengthText(String(minutesOf(setup.durationMs)));
      return;
    }
    const clamped = Math.min(MAX_MINUTES, Math.max(1, minutes));
    setLengthText(String(clamped));
    setSetup((current) => ({ ...current, durationMs: clamped * 60_000 }));
  }

  function commitFee(raw: string) {
    const ckb = Math.round(Number(raw));
    if (!raw.trim() || !Number.isFinite(ckb)) {
      setFeeText(String(Number(setup.feeShannons / 100_000_000n)));
      return;
    }
    const clamped = Math.max(1, ckb);
    setFeeText(String(clamped));
    setSetup((current) => ({ ...current, feeShannons: BigInt(clamped) * 100_000_000n }));
  }

  if (!isReady || (isConnected && registryConfigured() && nameLoading)) {
    return (
      <ArenaStage backHref="/play" backLabel="Crowns">
        <ChainLoader title="Checking your wallet…" />
      </ArenaStage>
    );
  }

  if (!isConnected) {
    return (
      <ArenaStage backHref="/play" backLabel="Crowns">
        <EmptyState title="Connect first" body="Connect your wallet in the header to host a crown." />
      </ArenaStage>
    );
  }

  if (registryConfigured() && !onChainUsername?.username) {
    return (
      <ArenaStage backHref="/play" backLabel="Crowns">
        <EmptyState title="Claim a username" body="Players see your name on the crown. Claim one to host." action={<Button href="/join?next=/create">Claim a username</Button>} />
      </ArenaStage>
    );
  }

  const fee = Number(setup.feeShannons / 100_000_000n);
  const minutes = minutesOf(setup.durationMs);
  // What the lobby will look like, without opening anything yet.
  const preview: CrownRoom = {
    id: 'preview',
    title: setup.title.trim() || 'Your crown',
    feeShannons: setup.feeShannons,
    durationMs: setup.durationMs,
    game: setup.game,
    status: 'lobby',
    round: 0,
    potShannons: 0n,
    king: null,
    kingScore: 0,
    openedAt: null,
    deadlineAt: null,
    feed: [],
    seals: [],
    matchId: null,
    hostLockHash: null,
    hostLock: null,
    matchOutPoint: null,
    treasuryOutPoint: null,
    bidOutPoint: null,
    kingLock: null,
    hostAddress: null,
  };

  const open = () => {
    const host = address.toLowerCase();
    const sealed = { ...sealCrown(setup), hostAddress: host };
    saveCrown(sealed);
    setSealing(true);
    setShareError(null);
    void publishCrown(sealed, host)
      .then(() => router.push(`/play/${sealed.id}`))
      .catch((error: unknown) => {
        setShareError(error instanceof Error ? error.message : 'The lobby could not be saved.');
        setSealing(false);
      });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 md:px-8 md:pt-12">
      <button
        type="button"
        onClick={() => (step ? setStep(step - 1) : router.push('/play'))}
        className="mb-6 inline-flex h-10 items-center gap-2 text-sm font-semibold text-mute hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
      </button>
      <h1 className="font-poster text-3xl font-black uppercase md:text-5xl">
        Host a <span className="text-lime">crown</span>
      </h1>
      {duel ? (
        <p className="mt-3 max-w-xl text-sm text-mute">
          Duel with {duel.slice(0, 8)}…{duel.slice(-6)}. Hosting this crown is the challenge. They enter from the play link.
        </p>
      ) : null}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div>
          <Stepper steps={[...STEPS]} current={step} tone="lime" onJump={setStep} />

          <div className="mt-8 min-h-[280px]">
            {step === 0 ? (
              <fieldset>
                <legend className="font-poster text-lg font-bold uppercase">Pick the game</legend>
                <div role="radiogroup" className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(Object.keys(GAMES) as GameId[]).map((game) => (
                    <ChoiceChip key={game} selected={setup.game === game} tone="lime" onClick={() => setSetup((current) => ({ ...current, game }))} className="overflow-hidden p-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ART.laneRace} alt="" className="aspect-video w-full object-cover" />
                      <div className="p-4">
                        <p className="font-poster text-sm font-bold uppercase">{GAMES[game].title}</p>
                        <p className="mt-1 text-sm text-mute">{GAMES[game].blurb}</p>
                      </div>
                    </ChoiceChip>
                  ))}
                  <div className="grid place-items-center rounded-2xl border-2 border-dashed border-white/10 p-6 text-center text-sm text-mute">More games are on the way.</div>
                </div>
              </fieldset>
            ) : null}

            {step === 1 ? (
              <fieldset>
                <legend className="font-poster text-lg font-bold uppercase">Entry fee</legend>
                <p className="mt-1 text-sm text-mute">What each player pays to send a winning run. Every new crown holder adds theirs to the pot. Unused entries are refunded.</p>
                <div role="radiogroup" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {FEES.map((value) => (
                    <ChoiceChip
                      key={value}
                      selected={fee === value}
                      tone="lime"
                      onClick={() => {
                        setFeeText(String(value));
                        commitFee(String(value));
                      }}
                      className="text-center"
                    >
                      <span className="block font-poster text-2xl font-extrabold text-gold">{value}</span>
                      <span className="font-mono text-[10px] text-mute">CKB</span>
                    </ChoiceChip>
                  ))}
                </div>
                <label className="mt-5 block max-w-xs">
                  <span className="text-sm font-semibold">Or any amount (CKB)</span>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={feeText}
                    onChange={(event) => setFeeText(event.target.value)}
                    onBlur={() => commitFee(feeText)}
                    className={`${FIELD} mt-2 h-12`}
                  />
                </label>
              </fieldset>
            ) : null}

            {step === 2 ? (
              <fieldset>
                <legend className="font-poster text-lg font-bold uppercase">Clock length</legend>
                <p className="mt-1 text-sm text-mute">The clock gets shorter every time someone takes the crown: 10 minutes off first, then less.</p>
                <div role="radiogroup" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {CLOCKS.map((c) => (
                    <ChoiceChip
                      key={c.minutes}
                      selected={minutes === c.minutes}
                      tone="lime"
                      onClick={() => {
                        setLengthText(String(c.minutes));
                        commitLength(String(c.minutes));
                      }}
                      className="text-center"
                    >
                      <span className="block font-poster text-lg font-extrabold">{c.label}</span>
                      <span className="font-mono text-[10px] text-mute">{c.minutes} min</span>
                    </ChoiceChip>
                  ))}
                </div>
                <label className="mt-5 block max-w-xs">
                  <span className="text-sm font-semibold">Or any length (minutes)</span>
                  <input
                    type="number"
                    min={1}
                    max={MAX_MINUTES}
                    inputMode="numeric"
                    value={lengthText}
                    onChange={(event) => setLengthText(event.target.value)}
                    onBlur={() => commitLength(lengthText)}
                    className={`${FIELD} mt-2 h-12`}
                  />
                </label>
              </fieldset>
            ) : null}

            {step === 3 ? (
              <div>
                <label htmlFor="crown-title" className="font-poster text-lg font-bold uppercase">
                  Title
                </label>
                <p className="mt-1 text-sm text-mute">Players see this in the lobby.</p>
                <input
                  id="crown-title"
                  value={setup.title}
                  maxLength={32}
                  onChange={(event) => setSetup((current) => ({ ...current, title: event.target.value }))}
                  className={`${FIELD} mt-4 h-14 text-lg font-semibold`}
                />
                <p className="mt-2 text-right font-mono text-[11px] text-mute">{setup.title.length}/32</p>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex justify-end">
            {step < STEPS.length - 1 ? (
              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => {
                  if (step === 1) commitFee(feeText);
                  if (step === 2) commitLength(lengthText);
                  setStep((current) => current + 1);
                }}
              >
                Next
              </Button>
            ) : (
              <div className="flex w-full flex-col items-end gap-2">
                <Button size="xl" className="w-full sm:w-auto" disabled={sealing || !setup.title.trim()} onClick={open}>
                  {sealing ? 'Saving the lobby…' : 'Open the lobby'}
                </Button>
                <p className="text-xs text-mute">Share the link, then start the clock when players are in. Starting it is one wallet approval.</p>
              </div>
            )}
          </div>
          {shareError ? <p className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{shareError}</p> : null}
        </div>

        <aside aria-label="Preview">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-mute">Preview</p>
          <div className="pointer-events-none">
            <CrownCard room={preview} />
          </div>
        </aside>
      </div>
    </div>
  );
}
