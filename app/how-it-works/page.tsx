import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/PageShell';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';

export const metadata: Metadata = {
  title: 'How it works — Crowns',
  description: 'Beat the score to take the crown. Each crown grows the pot and cuts the clock.',
};

const ACTS = [
  {
    act: 'Act one',
    title: 'Open',
    lines: ['The host picks the game, the clock and the entry fee, then starts the clock. The pot starts empty.'],
  },
  {
    act: 'Act two',
    title: 'Steal',
    lines: [
      'Practise for free on your own course. When a run beats the crown, send it. The chain replays it and, if it scores more, you are king.',
    ],
  },
  {
    act: 'Act three',
    title: 'Pay out',
    lines: ['At zero, anyone can close. The king takes the pot. Unused entries go back to their owners.'],
  },
];

const RULES = [
  { title: 'The pot', body: 'Grows by the entry fee with every crown taken.' },
  { title: 'The clock', body: 'The first crown cuts 10 minutes. Cuts halve every two crowns, never below 72 seconds.' },
  { title: 'The king', body: 'Whoever sent the last winning run. A king cannot steal from themselves.' },
  { title: 'Your run', body: 'Tied to your wallet. A copied run scores nothing for anyone else.' },
];

export default function HowItWorksPage() {
  return (
    <PageShell
      eyebrow="The rules"
      title="How it works"
      intro="Beat the score. Take the crown. Hold it at zero."
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

      <div className="mt-10">
        <Link
          href="/verify"
          className="inline-flex items-center rounded-md border border-[#99ee2d] px-4 py-3 text-xs font-bold uppercase text-[#99ee2d] hover:bg-[#99ee2d]/10"
        >
          Check a crown →
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
