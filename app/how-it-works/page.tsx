import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/PageShell';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';

export const metadata: Metadata = {
  title: 'How it works — Crowns',
  description:
    'One match cell, one treasury, one king. A correct steal grows the pot and cuts the clock. One wallet gets one try on the question in front of it.',
};

const ACTS = [
  {
    act: 'Act one',
    title: 'Host the bank',
    lines: [
      'A host writes four-option questions or lyric blanks. The chain stores a Merkle root, not the answer key.',
      'Opening the room creates one match cell and one treasury cell. The pot starts empty.',
    ],
  },
  {
    act: 'Act two',
    title: 'Steal',
    lines: [
      'A player locks a bid, then gets one try on the question in front of them. A correct answer spends that bid, adds the entry fee to the treasury, and writes their lock as king.',
    ],
  },
  {
    act: 'Act three',
    title: 'The clock pays',
    lines: [
      'The screen clock is a prediction. The match cell stores the deadline. Zero is the earliest moment the host may close.',
      'The close pays whoever holds the crown. A correct steal can still land until that transaction confirms. A miss does not spend the bid.',
    ],
  },
];

const RULES = [
  {
    title: 'The pot',
    body: 'Treasury capacity is the prize. Each steal increases it by the exact entry fee. The match data records the same number as the pot.',
  },
  {
    title: 'The clock',
    body: 'The first steal cuts 10 minutes. Every two rounds the cut halves, and it never goes below 72 seconds. The script computes it. The cell stores the new deadline.',
  },
  {
    title: 'The king',
    body: 'The king is a lock hash, not a username. Only the bid that was consumed in the steal can become king.',
  },
  {
    title: 'One try',
    body: 'The server records the first option a signed-in wallet picks on the current question. A second option gets no proof, so it cannot move the cell. The bid stays with that player for a later question.',
  },
];

export default function HowItWorksPage() {
  return (
    <PageShell
      eyebrow="The rules"
      title="How it works"
      intro="One cell holds the crown. Capacity holds the pot. Since decides who is paid."
      backHref="/"
      backLabel="Arena"
    >
      <div className="space-y-4">
        {ACTS.map((act) => (
          <section
            key={act.title}
            className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#2a1850]/60 to-[#15121d] p-5 text-white sm:p-7"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#ff56f6]">
              {act.act}
            </p>
            <h2 className="mt-2 font-poster text-4xl uppercase leading-[.9] sm:text-5xl">
              {act.title}
            </h2>
            {act.lines.map((line) => (
              <p
                key={line}
                className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-white/75"
              >
                {line}
              </p>
            ))}
          </section>
        ))}
      </div>

      <h2 className="mt-10 font-poster text-3xl uppercase leading-none text-white">
        The finer print
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {RULES.map((rule) => (
          <section
            key={rule.title}
            className="rounded-2xl border border-white/10 bg-white/5 p-5"
          >
            <h3 className="font-poster text-2xl uppercase leading-[.95] text-white">
              {rule.title}
            </h3>
            <p className="mt-3 text-sm font-medium leading-relaxed text-white/65">{rule.body}</p>
          </section>
        ))}
      </div>

      <h2 className="mt-10 font-poster text-3xl uppercase leading-none text-white">
        Do not take our word for it
      </h2>
      <p className="mt-4 max-w-2xl text-sm font-medium leading-relaxed text-white/65">
        Every crown ever taken is a transaction you can read yourself. Paste one into the checker
        and it walks the whole match back to the moment it opened, then re-tests each steal against
        the rules the script enforces: the proof behind the answer, the round, the pot, and the
        exact amount of time that crown cut. It reads the chain in your browser — no part of that
        answer comes from us. The proof carries a hash of the question and never the question, so a
        match can be audited to the last round without anyone learning what was asked.
      </p>
      <div className="mt-5">
        <Link
          href="/verify"
          className="inline-flex items-center rounded-md border border-[#99ee2d] px-4 py-3 text-xs font-bold uppercase text-[#99ee2d] hover:bg-[#99ee2d]/10"
        >
          Check a match →
        </Link>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <ArenaCta href="/play">Crowns</ArenaCta>
        <Link
          href="/create"
          className="inline-flex items-center rounded-md border border-white/20 bg-white/5 px-4 py-3 text-xs font-bold uppercase text-white hover:bg-white/10"
        >
          Open a crown
        </Link>
      </div>
    </PageShell>
  );
}
