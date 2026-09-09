import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/PageShell';
import { ArenaCta, KindCard } from '@/components/arena/ArenaPrimitives';

export const metadata: Metadata = {
  title: 'How it works — Keepers Relay',
  description:
    'A living CKB Cell passes from hand to hand, collects a mark from every Keeper, and dies if nobody passes it in time.',
};

const ACTS = [
  {
    act: 'Act one',
    title: 'Take it',
    lines: [
      'A Cell is a single scarce object on CKB. Only one Keeper holds it at a time — there is no shared copy and no second edition.',
      'Cells live inside rooms. Join one for the pots and the line — watching is free; holding needs an @handle.',
    ],
  },
  {
    act: 'Act two',
    title: 'Mark it',
    lines: [
      'Every Cell carries a prompt. Before you can pass it on, you answer that prompt once — a line, a view, a place, a stamp.',
      'Your mark is sealed into the Cell permanently and travels with it. After twenty Keepers, the Cell is worth more than when it left.',
    ],
  },
  {
    act: 'Act three',
    title: 'Pass it',
    lines: [
      'You get a window. Hand the Cell to another @handle before it closes and the line continues with your name in it.',
      'Miss the window and the Cell dies — not just for you, for everyone who ever carried it.',
    ],
  },
];

const RULES = [
  {
    title: 'Stakes & pots',
    body: 'Event seats cost CKB. The pot is the sum of stakes plus sponsors. Score points to rank — winners take CKB. Chain stakes use the same money language on the Arena.',
  },
  {
    title: 'Quests & archives',
    body: 'Return-home Quests have a finish line. Archives are the long game — one Keeper can make a tradition legendary. Different energy, same Cell engine.',
  },
  {
    title: 'The line',
    body: 'Every Keeper who held it becomes a figure in the cast. The carousel grows. That is the memorial and the brag.',
  },
  {
    title: 'Rescue',
    body: 'When a Cell is critical, roommates can buy it more time. Somebody still has to take it.',
  },
];

export default function HowItWorksPage() {
  return (
    <PageShell
      eyebrow="The rules"
      title="How it works"
      intro="Something alive gets handed to you. Keep it alive and leave your mark — or it dies on your watch."
      backHref="/"
      backLabel="Arena"
    >
      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <KindCard kind="blitz" />
        <KindCard kind="quest" />
        <KindCard kind="archive" />
      </div>

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

      <div className="mt-8 flex flex-wrap gap-3">
        <ArenaCta href="/events">Browse events</ArenaCta>
        <Link
          href="/create"
          className="inline-flex items-center rounded-md border border-white/20 bg-white/5 px-4 py-3 text-xs font-bold uppercase text-white hover:bg-white/10"
        >
          Create event
        </Link>
      </div>
    </PageShell>
  );
}
