'use client';

import { useEffect, useState } from 'react';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { loadBank } from '@/lib/sudden-death/bank';
import { bytesToHex, merkleRoot, shrinkMs, stealProof, type QuestionBank } from '@/lib/sudden-death/codec';

const ZERO_MATCH = new Uint8Array(32);
const LETTERS = ['A', 'B', 'C', 'D'];
const START_MS = 12000;

type FeedItem = { id: string; text: string; good: boolean };

export function SuddenDeathView() {
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [round, setRound] = useState(1);
  const [cursor, setCursor] = useState(0);
  const [left, setLeft] = useState(START_MS);
  const [pot, setPot] = useState(0);
  const [king, setKing] = useState('Open seat');
  const [youKing, setYouKing] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [flash, setFlash] = useState<'hit' | 'miss' | null>(null);
  const [over, setOver] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [shake, setShake] = useState(false);
  const [proofHex, setProofHex] = useState('');

  useEffect(() => {
    setBank(loadBank());
  }, []);

  const prompt = bank?.questions[cursor];
  const feeCkb = bank ? Number(bank.feeShannons / 100_000_000n) : 0;
  const panic = left <= 4000 && !over;
  let root = '';
  if (bank) {
    try {
      root = bytesToHex(merkleRoot(ZERO_MATCH, bank.questions));
    } catch {
      root = '';
    }
  }

  useEffect(() => {
    if (over || !prompt || !bank) return;
    const t = setInterval(() => {
      setLeft((ms) => {
        const next = ms - 40;
        if (next <= 0) {
          setOver(true);
          return 0;
        }
        return next;
      });
    }, 40);
    return () => clearInterval(t);
  }, [over, round, prompt, bank]);

  function pushFeed(text: string, good: boolean) {
    setFeed((rows) => [{ id: `${Date.now()}`, text, good }, ...rows].slice(0, 6));
  }

  function answer(index: number) {
    if (over || !prompt || !bank || picked !== null) return;
    setPicked(index);
    if (index === prompt.correct) {
      const cut = shrinkMs(round);
      const proof = stealProof(ZERO_MATCH, bank.questions, cursor);
      setFlash('hit');
      setPot((n) => n + feeCkb);
      setKing('You');
      setYouKing(true);
      setLeft((ms) => Math.max(0, ms - cut));
      setProofHex(bytesToHex(proof));
      setRound((n) => n + 1);
      pushFeed(`Steal proof ready · +${feeCkb} CKB · −${Math.round(cut / 60_000)} min`, true);
      window.setTimeout(() => {
        const next = cursor + 1;
        if (next >= bank.questions.length) {
          setOver(true);
          setLeft(0);
        } else {
          setCursor(next);
        }
        setPicked(null);
        setFlash(null);
      }, 420);
      return;
    }
    setFlash('miss');
    setShake(true);
    pushFeed('Miss. The clock keeps bleeding. The cell does not move.', false);
    window.setTimeout(() => setShake(false), 480);
    window.setTimeout(() => {
      setPicked(null);
      setFlash(null);
    }, 700);
  }

  function restart() {
    setRound(1);
    setCursor(0);
    setLeft(START_MS);
    setPot(0);
    setKing('Open seat');
    setYouKing(false);
    setPicked(null);
    setFlash(null);
    setOver(false);
    setFeed([]);
    setProofHex('');
    setBank(loadBank());
  }

  const secs = (left / 1000).toFixed(2);

  return (
    <ArenaStage>
      <div className={shake ? 'animate-[sdshake_0.4s_linear]' : ''}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
              Sudden death · {bank?.title ?? 'Loading bank'}
            </p>
            <h1 className="mt-2 font-poster text-5xl uppercase leading-none text-white sm:text-6xl">
              {over ? 'Clock dead' : panic ? 'Bleeding' : 'Live pot'}
            </h1>
          </div>
          <p className="max-w-xs text-right font-mono text-[10px] uppercase text-white/45">
            {prompt?.skin === 'lyric' ? 'Lyric blank' : 'Quiz'}
          </p>
        </div>

        {!prompt || !bank ? (
          <p className="mt-8 text-sm text-white/50">Loading the bank.</p>
        ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <section
            className={`border bg-black/55 p-5 sm:p-7 ${
              panic ? 'border-[#af2a3a]' : 'border-white/15'
            }`}
          >
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                  Round {round}
                </p>
                <p
                  className={`font-poster text-7xl leading-none sm:text-8xl ${
                    panic ? 'text-[#af2a3a]' : 'text-[#99ee2d]'
                  }`}
                >
                  {secs}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[10px] uppercase text-white/40">Pot</p>
                <p className="font-poster text-4xl uppercase text-white">{pot}</p>
                <p className="font-mono text-[10px] uppercase text-[#99ee2d]">CKB</p>
              </div>
            </div>
            <div className="mt-4 h-2 bg-white/10">
              <div
                className={`h-full ${panic ? 'bg-[#af2a3a]' : 'bg-[#99ee2d]'}`}
                style={{ width: `${Math.max(0, Math.min(100, (left / START_MS) * 100))}%` }}
              />
            </div>

            <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-[#e1bf47]">
              {prompt.tag}
            </p>
            <h2 className="mt-2 max-w-3xl font-poster text-3xl uppercase leading-[0.95] text-white sm:text-4xl">
              {prompt.skin === 'lyric' ? lyricLine(prompt.text) : prompt.text}
            </h2>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {prompt.options.map((option, i) => {
                const on = picked === i;
                const good = flash === 'hit' && i === prompt.correct;
                const bad = flash === 'miss' && on;
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={over || picked !== null}
                    onClick={() => answer(i)}
                    className={`border px-4 py-4 text-left transition disabled:opacity-50 ${
                      good
                        ? 'border-[#99ee2d] bg-[#99ee2d]/15'
                        : bad
                          ? 'border-[#af2a3a] bg-[#af2a3a]/20'
                          : 'border-white/15 bg-black/40 hover:border-[#99ee2d]'
                    }`}
                  >
                    <span className="font-mono text-[10px] uppercase text-white/40">{LETTERS[i]}</span>
                    <span className="mt-1 block text-base font-semibold text-white">{option}</span>
                  </button>
                );
              })}
            </div>

            {over ? (
              <div className="mt-6 border border-[#99ee2d]/40 bg-[#99ee2d]/10 p-4">
                <p className="font-mono text-[10px] uppercase text-[#99ee2d]">Settlement</p>
                <p className="mt-1 font-poster text-4xl uppercase text-white">
                  {youKing ? 'You take the pot' : `${king} takes the pot`}
                </p>
                <p className="mt-2 text-sm text-white/60">{pot} CKB · last confirmed king</p>
                <button
                  type="button"
                  onClick={() => restart()}
                  className="mt-4 border border-[#99ee2d] px-4 py-2 font-mono text-[11px] uppercase text-[#99ee2d]"
                >
                  Run it back
                </button>
              </div>
            ) : null}
          </section>

          <aside className="space-y-4">
            <div className="border border-white/15 bg-black/50 p-4">
              <p className="font-mono text-[10px] uppercase text-white/40">King</p>
              <p className="mt-1 font-poster text-4xl uppercase text-white">{king}</p>
              <p className="mt-2 text-xs text-white/45">
                A right answer is a bid plus a Merkle proof. It adds {feeCkb} CKB and cuts {round > 0 ? Math.round(shrinkMs(round) / 60_000) : 10} min.
                A miss does not spend the cell.
              </p>
            </div>
            <div className="border border-white/15 bg-black/50 p-4">
              <p className="font-mono text-[10px] uppercase text-white/40">Match root</p>
              <p className="mt-2 break-all font-mono text-[10px] text-[#99ee2d]">{root}</p>
              {proofHex ? (
                <p className="mt-2 break-all font-mono text-[10px] text-white/50">Last proof {proofHex.slice(0, 18)}…</p>
              ) : null}
            </div>
            <div className="border border-white/15 bg-black/50 p-4">
              <p className="font-mono text-[10px] uppercase text-white/40">Steal feed</p>
              <ul className="mt-3 space-y-2">
                {feed.length === 0 ? (
                  <li className="text-sm text-white/40">Waiting on the first steal.</li>
                ) : (
                  feed.map((row) => (
                    <li key={row.id} className={`text-sm ${row.good ? 'text-[#99ee2d]' : 'text-[#af2a3a]'}`}>
                      {row.text}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </aside>
        </div>
        )}
      </div>
      <style>{`@keyframes sdshake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}`}</style>
    </ArenaStage>
  );
}

function lyricLine(text: string) {
  const parts = text.split('______');
  if (parts.length < 2) return text;
  return (
    <>
      {parts[0]}
      <span className="mx-2 inline-block border border-[#e1bf47] bg-[#e1bf47]/15 px-2 text-[#e1bf47]">
        ?????
      </span>
      {parts[1] ?? ''}
    </>
  );
}
