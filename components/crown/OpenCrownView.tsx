'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { NeonPlate } from '@/components/crown/CrownCard';
import { emptyQuestion, saveBank } from '@/lib/sudden-death/bank';
import { bytesToHex, merkleRoot, type BankQuestion } from '@/lib/sudden-death/codec';
import { EVENT_PRESETS, type EventKind } from '@/lib/sudden-death/events';
import { publishCrown } from '@/lib/crown/remote';
import { saveCrown, sealCrown } from '@/lib/crown/rooms';
import { useWallet } from '@/hooks/useWallet';
import { useUsername } from '@/hooks/useUsername';
import { registryConfigured } from '@/lib/registry/config';

const ZERO_MATCH = new Uint8Array(32);
const STEPS = ['Event', 'Clock', 'Bank', 'Lobby'] as const;
const DEFAULT_MINUTES = 120;
const MAX_MINUTES = 48 * 60;

function minutesOf(durationMs?: number): number {
  return Math.round((durationMs ?? DEFAULT_MINUTES * 60_000) / 60_000);
}

export function OpenCrownView() {
  const router = useRouter();
  const duel = useSearchParams().get('duel');
  const { address, isConnected, isReady } = useWallet();
  const { username: onChainUsername, isLoading: nameLoading } = useUsername();
  const [step, setStep] = useState(0);
  const [eventId, setEventId] = useState<EventKind | null>(null);
  const [bank, setBank] = useState(() => EVENT_PRESETS[0]!.bank);
  const [lengthText, setLengthText] = useState(() => String(minutesOf(EVENT_PRESETS[0]!.bank.durationMs)));
  const [feeText, setFeeText] = useState(() => String(Number(EVENT_PRESETS[0]!.bank.feeShannons / 100_000_000n)));
  const [shareError, setShareError] = useState<string | null>(null);
  const [sealing, setSealing] = useState(false);

  const root = useMemo(() => {
    try {
      return bytesToHex(merkleRoot(ZERO_MATCH, bank.questions));
    } catch {
      return null;
    }
  }, [bank.questions]);

  function commitLength(raw: string) {
    const minutes = Math.round(Number(raw));
    if (!raw.trim() || !Number.isFinite(minutes)) {
      setLengthText(String(minutesOf(bank.durationMs)));
      return;
    }
    const clamped = Math.min(MAX_MINUTES, Math.max(1, minutes));
    setLengthText(String(clamped));
    setBank((current) => ({ ...current, durationMs: clamped * 60_000 }));
  }

  function commitFee(raw: string) {
    const ckb = Math.round(Number(raw));
    if (!raw.trim() || !Number.isFinite(ckb)) {
      setFeeText(String(Number(bank.feeShannons / 100_000_000n)));
      return;
    }
    const clamped = Math.max(1, ckb);
    setFeeText(String(clamped));
    setBank((current) => ({ ...current, feeShannons: BigInt(clamped) * 100_000_000n }));
  }

  function updateQuestion(index: number, next: BankQuestion) {
    setBank((current) => {
      const questions = current.questions.slice();
      questions[index] = next;
      return { ...current, questions };
    });
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
          Hosting stays closed until the wallet in the header is connected. This page will not open the wallet for you.
        </p>
      </ArenaStage>
    );
  }

  if (registryConfigured() && !onChainUsername?.username) {
    return (
      <ArenaStage backHref="/play" backLabel="Crowns">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">Host</p>
        <h1 className="mt-3 font-poster text-5xl uppercase text-white">Claim a username</h1>
        <p className="mt-3 max-w-md text-sm text-white/60">
          A connected wallet claims a handle before it can host.
        </p>
        <a href="/join?next=/create" className="arena-cta mt-6 inline-flex px-4 py-2 font-mono text-[11px] font-bold uppercase">
          Claim a username
        </a>
      </ArenaStage>
    );
  }

  return (
    <ArenaStage backHref="/play" backLabel="Crowns">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
        Open an event
      </p>
      <h1 className="mt-2 font-poster text-5xl uppercase leading-none text-white sm:text-6xl">
        {STEPS[step]}
      </h1>
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
            Each box is its own event. Pick one, then edit the lines. More events can be added later.
          </p>
          <ul className="mt-6 grid max-w-3xl gap-3 sm:grid-cols-2">
            {EVENT_PRESETS.map((event) => {
              const on = eventId === event.id;
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEventId(event.id);
                      setBank((current) => ({
                        ...event.bank,
                        durationMs: current.durationMs,
                        title: duel ? 'Duel' : event.bank.title,
                      }));
                    }}
                    className={`relative aspect-[16/10] w-full overflow-hidden border text-left ${on ? 'border-[#99ee2d]' : 'border-white/15'}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={event.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    <span className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" />
                    <span className="relative flex h-full flex-col justify-end p-5">
                      <span className="font-poster text-3xl uppercase leading-none text-white">{event.title}</span>
                      <span className="mt-2 text-sm text-white/75">{event.blurb}</span>
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
            You set the opening length in minutes. 120 is two hours. 30 is thirty minutes. Start
            the clock writes that deadline into the match. Everyone sees the same number. A correct
            answer grows the pot by the entry fee and shortens the clock: the first one cuts 10
            minutes, later ones cut less, and the floor is 72 seconds. A length already shorter
            than the cut ends at one second. The screen is a prediction. The chain timestamp pays.
          </p>
          <label className="mt-8 block max-w-md">
            <span className="font-mono text-[10px] uppercase text-white/50">Crown title</span>
            <input
              value={bank.title}
              onChange={(event) => setBank((current) => ({ ...current, title: event.target.value }))}
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
            The fee is the bid. Spending that bid on a correct answer is what grows the pot. There is
            no second lobby charge.
          </p>
        </NeonPlate>
      ) : null}

      {step === 2 ? (
        <div className="mt-8 max-w-xl">
          <p className="max-w-2xl text-sm text-white/60">
            You write the lines. Players do not. Each question has four options, and the marked one is
            the answer. The bank length has to be 2, 4, 8, 16, 32, or 64.
          </p>
          <ol className="mt-6 space-y-4">
            {bank.questions.map((question, index) => (
              <li key={`${index}-${question.salt[0]}`}>
                <NeonPlate className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-mono text-[10px] uppercase text-white/50">
                    Round {index + 1} · {question.skin}
                  </p>
                </div>
                {question.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={question.image} alt="" className="mt-3 aspect-video w-full object-cover" />
                ) : null}
                <input
                  value={question.text}
                  placeholder={question.skin === 'lyric' || question.skin === 'chant' ? 'Line with a ______ blank' : 'Question'}
                  onChange={(event) => updateQuestion(index, { ...question, text: event.target.value })}
                  className="mt-3 w-full border border-white/15 bg-black px-3 py-3 text-white outline-none focus:border-[#99ee2d]"
                />
                <div className="mt-3 grid gap-2">
                  {question.options.map((option, optionIndex) => (
                    <label key={optionIndex} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${index}`}
                        checked={question.correct === optionIndex}
                        onChange={() =>
                          updateQuestion(index, {
                            ...question,
                            correct: optionIndex as BankQuestion['correct'],
                          })
                        }
                      />
                      <input
                        value={option}
                        placeholder={`Option ${optionIndex + 1}`}
                        onChange={(event) => {
                          const options = [...question.options] as BankQuestion['options'];
                          options[optionIndex] = event.target.value;
                          updateQuestion(index, { ...question, options });
                        }}
                        className="w-full border border-white/15 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#99ee2d]"
                      />
                    </label>
                  ))}
                </div>
                </NeonPlate>
              </li>
            ))}
          </ol>
          <button
            type="button"
            disabled={bank.questions.length >= 64}
            onClick={() =>
              setBank((current) => ({
                ...current,
                questions: [
                  ...current.questions,
                  ...current.questions.map(() => emptyQuestion(current.questions[0]?.skin ?? 'quiz')),
                ],
              }))
            }
            className="mt-4 border border-white/20 px-4 py-2 font-mono text-[11px] uppercase text-white disabled:opacity-40"
          >
            Double the bank
          </button>
        </div>
      ) : null}

      {step === 3 ? (
        <NeonPlate className="mt-8 max-w-2xl p-5">
          <p className="font-mono text-[10px] uppercase text-white/70">Merkle root preview</p>
          <p className="mt-2 break-all font-mono text-xs text-[#bef970]">
            {root ?? 'Bank length must be 2, 4, 8, 16, 32, or 64, and every line needs text.'}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-white/85">
            Opening the lobby saves this event so any browser can open the link. The questions stay off CKB.
            The Merkle root is only a hash of the bank. Starting the clock is the transaction that
            writes that root into the match cell.
          </p>
          <p className="mt-3 text-sm text-white/75">
            The preview root uses an empty match id. The real root is recomputed when the match cell
            gets its type id.
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
        {step < 3 ? (
          <button
            type="button"
            disabled={step === 0 && !eventId}
            onClick={() => {
              if (step === 1) {
                commitLength(lengthText);
                commitFee(feeText);
              }
              setStep((current) => current + 1);
            }}
            className="arena-cta px-4 py-2 font-mono text-[11px] font-bold uppercase disabled:opacity-40"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            disabled={!root || sealing}
            onClick={() => {
              saveBank(bank);
              const host = address.toLowerCase();
              const sealed = {
                ...sealCrown(bank),
                hostAddress: host,
              };
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
