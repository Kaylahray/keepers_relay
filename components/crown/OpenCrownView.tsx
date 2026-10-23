'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { NeonPlate } from '@/components/crown/CrownCard';
import { useWallet } from '@/hooks/useWallet';
import { useUsername } from '@/hooks/useUsername';
import { publishCrown } from '@/lib/crown/remote';
import { DEFAULT_DURATION_MS, FLOOR_CROWN, GAMES, saveCrown, sealCrown, type CrownSetup, type GameId } from '@/lib/crown/rooms';
import { registryConfigured } from '@/lib/registry/config';

const STEPS = ['Game', 'Clock', 'Lobby'] as const;
const MAX_MINUTES = 48 * 60;

function minutesOf(durationMs?: number): number {
  return Math.round((durationMs ?? DEFAULT_DURATION_MS) / 60_000);
}

export function OpenCrownView() {
  const router = useRouter();
  const duel = useSearchParams().get('duel');
  const { address, isConnected, isReady } = useWallet();
  const { username: onChainUsername, isLoading: nameLoading } = useUsername();
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
        <p className="font-mono text-xs uppercase text-white/50">Checking your wallet…</p>
      </ArenaStage>
    );
  }

  if (!isConnected) {
    return (
      <ArenaStage backHref="/play" backLabel="Crowns">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">Host</p>
        <h1 className="mt-3 font-poster text-5xl uppercase text-white">Connect first</h1>
        <p className="mt-3 max-w-md text-sm text-white/60">
          Connect your wallet in the header to host.
        </p>
      </ArenaStage>
    );
  }

  if (registryConfigured() && !onChainUsername?.username) {
    return (
      <ArenaStage backHref="/play" backLabel="Crowns">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">Host</p>
        <h1 className="mt-3 font-poster text-5xl uppercase text-white">Claim a username</h1>
        <p className="mt-3 max-w-md text-sm text-white/60">Claim a username to host.</p>
        <a href="/join?next=/create" className="arena-cta mt-6 inline-flex px-4 py-2 font-mono text-[11px] font-bold uppercase">
          Claim a username
        </a>
      </ArenaStage>
    );
  }

  return (
    <ArenaStage backHref="/play" backLabel="Crowns">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">Open a crown</p>
      <h1 className="mt-2 font-poster text-5xl uppercase leading-none text-white sm:text-6xl">{STEPS[step]}</h1>
      {duel ? (
        <p className="mt-3 max-w-xl text-sm text-white/60">
          Duel with {duel.slice(0, 8)}…{duel.slice(-6)}. Hosting this crown is the challenge. They enter from the play link.
        </p>
      ) : null}
      <ol className="mt-4 flex gap-4 font-mono text-[10px] uppercase text-white/40">
        {STEPS.map((label, index) => (
          <li key={label} className={index === step ? 'text-[#99ee2d]' : ''}>
            0{index + 1} {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="mt-8">
          <p className="max-w-2xl text-sm text-white/60">
            Pick the game players race on. More are coming.
          </p>
          <ul className="mt-6 grid max-w-3xl gap-3 sm:grid-cols-2">
            {(Object.keys(GAMES) as GameId[]).map((game) => {
              const on = setup.game === game;
              return (
                <li key={game}>
                  <button
                    type="button"
                    onClick={() => setSetup((current) => ({ ...current, game }))}
                    className={`relative aspect-[16/10] w-full overflow-hidden border text-left ${on ? 'border-[#99ee2d]' : 'border-white/15'}`}
                  >
                    <span className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0,transparent_32%,rgba(153,238,45,0.25)_32%,rgba(153,238,45,0.25)_33.3%)]" />
                    <span className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/10" />
                    <span className="relative flex h-full flex-col justify-end p-5">
                      <span className="font-poster text-3xl uppercase leading-none text-white">{GAMES[game].title}</span>
                      <span className="mt-2 text-sm text-white/75">{GAMES[game].blurb}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {step === 1 ? (
        <NeonPlate className="mt-8 max-w-2xl p-6">
          <p className="text-sm leading-relaxed text-white/70">
            Set the clock and the entry fee. Each crown taken adds the fee to the pot and cuts the clock: 10 minutes first, then less.
          </p>
          <label className="mt-8 block max-w-md">
            <span className="font-mono text-[10px] uppercase text-white/50">Crown title</span>
            <input
              value={setup.title}
              onChange={(event) => setSetup((current) => ({ ...current, title: event.target.value }))}
              className="mt-2 w-full border border-white/15 bg-black px-3 py-3 text-white outline-none focus:border-[#99ee2d]"
            />
          </label>
          <label className="mt-4 block max-w-xs">
            <span className="font-mono text-[10px] uppercase text-white/50">Length (minutes)</span>
            <input
              type="number"
              min={1}
              max={MAX_MINUTES}
              inputMode="numeric"
              value={lengthText}
              onChange={(event) => setLengthText(event.target.value)}
              onBlur={() => commitLength(lengthText)}
              className="mt-2 w-full border border-white/15 bg-black px-3 py-3 text-white outline-none focus:border-[#99ee2d]"
            />
          </label>
          <label className="mt-4 block max-w-xs">
            <span className="font-mono text-[10px] uppercase text-white/50">Entry fee (CKB)</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={feeText}
              onChange={(event) => setFeeText(event.target.value)}
              onBlur={() => commitFee(feeText)}
              className="mt-2 w-full border border-white/15 bg-black px-3 py-3 text-white outline-none focus:border-[#99ee2d]"
            />
          </label>
          <p className="mt-4 max-w-xl text-sm text-white/60">
            Players pay only to send a winning run. Unused entries are refunded.
          </p>
        </NeonPlate>
      ) : null}

      {step === 2 ? (
        <NeonPlate className="mt-8 max-w-2xl p-5">
          <p className="font-mono text-[10px] uppercase text-white/70">{GAMES[setup.game].title}</p>
          <p className="mt-2 font-poster text-3xl uppercase leading-none text-white">{setup.title}</p>
          <p className="mt-3 font-mono text-[11px] uppercase text-[#bef970]">
            {minutesOf(setup.durationMs)} min · {Number(setup.feeShannons / 100_000_000n)} CKB entry
          </p>
          <p className="mt-4 text-sm leading-relaxed text-white/85">
            Open the lobby, share the link, then start the clock when players are in.
          </p>
        </NeonPlate>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep((current) => current - 1)}
            className="border border-white/30 px-4 py-2 font-mono text-[11px] uppercase text-white"
          >
            Back
          </button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => {
              if (step === 1) {
                commitLength(lengthText);
                commitFee(feeText);
              }
              setStep((current) => current + 1);
            }}
            className="arena-cta px-4 py-2 font-mono text-[11px] font-bold uppercase"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            disabled={sealing || !setup.title.trim()}
            onClick={() => {
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
            }}
            className="arena-cta px-4 py-2 font-mono text-[11px] font-bold uppercase disabled:opacity-40"
          >
            {sealing ? 'Saving the lobby…' : 'Open the lobby'}
          </button>
        )}
      </div>
      {shareError ? <p className="mt-4 text-sm text-[#af2a3a]">{shareError}</p> : null}
    </ArenaStage>
  );
}
