import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/PageShell';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { STORY, StoryPicture } from '@/components/explain/StoryPicture';

export const metadata: Metadata = {
  title: 'How it works — Crowns',
  description: 'Beat the best score to grab the crown. Each grab grows the prize and shortens the clock. Hold it at zero to win.',
};

/** The details, each in a sentence or two, for anyone who wants more than the four steps. */
const DETAILS = [
  {
    title: 'The prize',
    body: 'It starts empty. Every time someone grabs the crown, their entry fee goes into it. The winner takes all of it.',
  },
  {
    title: 'The clock',
    body: 'Each grab takes time off: 10 minutes the first time, then 5, then less, never under 72 seconds. The more people play, the faster it ends.',
  },
  {
    title: 'Your entry',
    body: 'You only pay when you grab the crown. Practice is always free. If your entry never gets used, you get it back after the game.',
  },
  {
    title: 'Your road',
    body: 'Your road is made just for you, from the game and your wallet. Someone copying your moves would crash on their own road.',
  },
  {
    title: 'Holding the crown',
    body: "You can't grab the crown from yourself. To win, keep it until the clock hits zero.",
  },
  {
    title: 'Ending the game',
    body: 'When the clock hits zero, anyone can end the game. The prize goes to whoever holds the crown, and unused entries go back to their owners.',
  },
];

export default function HowItWorksPage() {
  return (
    <PageShell
      eyebrow="How to play"
      title="How it works"
      intro="Beat the best score. Grab the crown. Hold it at zero to win the prize."
      backHref="/"
      backLabel="Home"
    >
      <ol className="grid gap-4 sm:grid-cols-2">
        {STORY.map((step, index) => (
          <li key={step.kind} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            <StoryPicture kind={step.kind} className="aspect-[16/10] border-0 border-b" />
            <div className="p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">Step {index + 1}</p>
              <h2 className="mt-2 font-poster text-2xl uppercase leading-none text-white">{step.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-white/75">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="mt-10 font-poster text-3xl uppercase leading-none text-white">The details</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {DETAILS.map((detail) => (
          <section key={detail.title} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h3 className="font-poster text-xl uppercase leading-[.95] text-white">{detail.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/70">{detail.body}</p>
          </section>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <ArenaCta href="/play">Find a game</ArenaCta>
        <Link
          href="/create"
          className="inline-flex items-center rounded-md border border-white/20 bg-white/5 px-4 py-3 text-xs font-bold uppercase text-white hover:bg-white/10"
        >
          Start a game
        </Link>
        <Link
          href="/verify"
          className="inline-flex items-center rounded-md border border-[#99ee2d] px-4 py-3 text-xs font-bold uppercase text-[#99ee2d] hover:bg-[#99ee2d]/10"
        >
          Check any game →
        </Link>
      </div>
    </PageShell>
  );
}
