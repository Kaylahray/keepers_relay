'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { emptyQuestion, loadBank, saveBank } from '@/lib/sudden-death/bank';
import {
  bytesToHex,
  merkleRoot,
  type BankQuestion,
  type QuestionBank,
} from '@/lib/sudden-death/codec';
import { suddenDeathConfigured } from '@/lib/registry/config';

const ZERO_MATCH = new Uint8Array(32);

export function HostBankView() {
  const [bank, setBank] = useState<QuestionBank>(() => loadBank());
  const [saved, setSaved] = useState(false);
  const chainReady = suddenDeathConfigured();

  const root = useMemo(() => {
    try {
      return bytesToHex(merkleRoot(ZERO_MATCH, bank.questions));
    } catch {
      return null;
    }
  }, [bank.questions]);

  function updateQuestion(index: number, next: BankQuestion) {
    setSaved(false);
    setBank((current) => {
      const questions = current.questions.slice();
      questions[index] = next;
      return { ...current, questions };
    });
  }

  function doubleBank() {
    setSaved(false);
    setBank((current) => ({
      ...current,
      questions: [
        ...current.questions,
        ...current.questions.map((_, index) => emptyQuestion(index % 2 === 0 ? 'quiz' : 'lyric')),
      ],
    }));
  }

  return (
    <ArenaStage>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
        Host desk
      </p>
      <h1 className="mt-2 font-poster text-5xl uppercase leading-none text-white sm:text-6xl">
        Write the bank
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/60">
        You write the questions. Players do not. The chain stores one Merkle root on the match cell.
        A correct steal spends one bid, grows the treasury by the entry fee, and names that bid&apos;s lock
        the king. The screen clock is a prediction. The cell&apos;s <span className="text-white">since</span> is
        what pays the pot.
      </p>

      <label className="mt-8 block max-w-md">
        <span className="font-mono text-[10px] uppercase text-white/40">Room title</span>
        <input
          value={bank.title}
          onChange={(event) => {
            setSaved(false);
            setBank((current) => ({ ...current, title: event.target.value }));
          }}
          className="mt-2 w-full border border-white/15 bg-black px-3 py-3 text-white outline-none focus:border-[#99ee2d]"
        />
      </label>

      <label className="mt-4 block max-w-xs">
        <span className="font-mono text-[10px] uppercase text-white/40">Entry fee (CKB)</span>
        <input
          type="number"
          min={1}
          value={Number(bank.feeShannons / 100_000_000n)}
          onChange={(event) => {
            setSaved(false);
            const ckb = BigInt(Math.max(1, Number(event.target.value) || 1));
            setBank((current) => ({ ...current, feeShannons: ckb * 100_000_000n }));
          }}
          className="mt-2 w-full border border-white/15 bg-black px-3 py-3 text-white outline-none focus:border-[#99ee2d]"
        />
      </label>

      <ol className="mt-8 space-y-4">
        {bank.questions.map((question, index) => (
          <li key={`${question.salt[0]}-${index}`} className="border border-white/15 bg-black/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase text-[#e1bf47]">
                Round {index + 1} · {question.skin}
              </p>
              <button
                type="button"
                onClick={() =>
                  updateQuestion(index, {
                    ...question,
                    skin: question.skin === 'quiz' ? 'lyric' : 'quiz',
                  })
                }
                className="font-mono text-[10px] uppercase text-white/60"
              >
                Switch to {question.skin === 'quiz' ? 'lyric' : 'quiz'}
              </button>
            </div>
            <input
              value={question.text}
              placeholder={question.skin === 'lyric' ? 'Line with a ______ blank' : 'Question'}
              onChange={(event) => updateQuestion(index, { ...question, text: event.target.value })}
              className="mt-3 w-full border border-white/10 bg-black px-3 py-3 text-white outline-none focus:border-[#99ee2d]"
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
                    className="w-full border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#99ee2d]"
                  />
                </label>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={doubleBank}
          disabled={bank.questions.length >= 64}
          className="border border-white/20 px-4 py-2 font-mono text-[11px] uppercase text-white disabled:opacity-40"
        >
          Double the bank
        </button>
        <button
          type="button"
          disabled={!root}
          onClick={() => {
            saveBank(bank);
            setSaved(true);
          }}
          className="border border-[#99ee2d] bg-[#99ee2d] px-4 py-2 font-mono text-[11px] font-bold uppercase text-[#111] disabled:opacity-40"
        >
          Save bank
        </button>
        <Link href="/play" className="border border-white/20 px-4 py-2 font-mono text-[11px] uppercase text-white">
          Play it
        </Link>
      </div>

      <div className="mt-8 border border-white/15 bg-black/40 p-4">
        <p className="font-mono text-[10px] uppercase text-white/40">Merkle root for the match cell</p>
        <p className="mt-2 break-all font-mono text-xs text-[#99ee2d]">
          {root ?? 'Bank length must be 2, 4, 8, 16, 32, or 64, and every line needs text.'}
        </p>
        <p className="mt-3 text-sm text-white/55">
          {chainReady
            ? 'Match, bid, and treasury scripts are configured. Minting the live cell is the next transaction.'
            : 'Scripts are not on Pudge yet. Saving the bank keeps the root, salts, and fee on this device. The contract tests are what prove the cell rules before deploy.'}
        </p>
        {saved ? <p className="mt-2 font-mono text-[10px] uppercase text-[#99ee2d]">Saved on this device.</p> : null}
      </div>
    </ArenaStage>
  );
}
