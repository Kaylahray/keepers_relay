import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/PageShell';

export const metadata: Metadata = {
  title: 'How it works — Keepers Relay',
  description: 'A living CKB Cell that travels, collects marks, and dies if nobody passes it.',
};

const RULES = [
  {
    title: 'One Cell. One holder.',
    body: 'A streak is a single scarce object — a CKB Cell. Only one person holds it at a time.',
  },
  {
    title: 'Every holder leaves one mark.',
    body: 'Before you pass, you seal one contribution: a view, a line, a stamp, a place. The Cell gets more interesting after twenty people touch it.',
  },
  {
    title: 'The clock is the pressure.',
    body: 'Each holder has a window to contribute and pass. Miss it and the lineage dies. Urgency is the game.',
  },
  {
    title: 'Passing consumes and creates.',
    body: 'A handoff spends the current Cell and creates a successor for the next Keeper. The lineage is the proof.',
  },
  {
    title: 'Return home.',
    body: 'Some streaks only travel to new holders, then come back to the creator to seal the journey.',
  },
  {
    title: 'Communities hold streaks.',
    body: 'Join a room. Launch a Cell. Pass it to an @handle. Watchers can look; members can play.',
  },
];

export default function HowItWorksPage() {
  return (
    <PageShell
      eyebrow="The rules"
      title="How it works"
      intro="Keepers Relay turns a CKB Cell into a living social artefact. Hold it, leave a mark, pass it on."
      backHref="/"
      backLabel="Home"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {RULES.map((rule, i) => (
          <section key={rule.title} className="neo-card bg-[#fff8e7] p-5">
            <span className="inline-block border-2 border-black bg-[#d6ff00] px-2 py-1 font-mono text-[10px] font-bold">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h2 className="mt-3 font-poster text-2xl uppercase leading-[.95]">{rule.title}</h2>
            <p className="mt-3 text-sm font-semibold leading-relaxed">{rule.body}</p>
          </section>
        ))}
      </div>

      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          href="/communities"
          className="neo-button bg-[#d6ff00] px-4 py-3 text-xs font-black uppercase text-black"
        >
          Open communities
        </Link>
        <Link
          href="/streaks"
          className="neo-button bg-[#ff4cbd] px-4 py-3 text-xs font-black uppercase text-black"
        >
          Live streaks
        </Link>
      </div>
    </PageShell>
  );
}
