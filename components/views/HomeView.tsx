'use client';

import { HomeHero, LiveNow } from '@/components/arena/HomeHero';
import { Onboarding } from '@/components/explain/Onboarding';
import { Button } from '@/components/ui/Button';
import { StepList, CROWN_STEPS, DUEL_STEPS, FAIR_PLAY_FACTS } from '@/components/explain/StepList';
import { ART } from '@/lib/art';

const MODES = [
  {
    title: 'Crowns',
    tag: 'Many players · king of the hill',
    body: 'Beat the best score to take the crown. Hold it when the clock hits zero and the whole pot is yours.',
    img: ART.crowns,
    alt: 'A champion wearing the crown on top of a podium of coins',
    href: '/play',
    cta: 'Find a crown',
    tone: 'lime' as const,
  },
  {
    title: 'Duels',
    tag: '1 v 1 · winner takes both',
    body: 'Challenge one player to Artillery or a Lane race. Same stake each. Best player takes it all.',
    img: ART.duels,
    alt: 'Two friends challenging each other on their phones',
    href: '/duels',
    cta: 'Go to duels',
    tone: 'pink' as const,
  },
];

export function HomeView() {
  return (
    <div className="w-full">
      <Onboarding />
      <HomeHero />

      <div className="mx-auto mt-10 max-w-7xl px-4 md:mt-14 md:px-8">
        <LiveNow />
      </div>

      <section className="mx-auto mt-20 max-w-7xl px-4 md:px-8" aria-labelledby="ways">
        <h2 id="ways" className="font-poster text-2xl font-extrabold uppercase md:text-4xl">
          Two ways to play
        </h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {MODES.map((m) => (
            <article key={m.title} className="clip-panel flex flex-col overflow-hidden bg-ink-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.img} alt={m.alt} className="aspect-[16/10] w-full object-cover" />
              <div className="flex flex-1 flex-col p-6 md:p-8">
                <p className={`font-mono text-[11px] uppercase tracking-wider ${m.tone === 'lime' ? 'text-lime' : 'text-pink'}`}>{m.tag}</p>
                <h3 className={`mt-2 font-poster text-3xl font-black uppercase md:text-4xl ${m.tone === 'lime' ? 'text-lime' : 'text-pink'}`}>{m.title}</h3>
                <p className="mt-3 max-w-md text-mute">{m.body}</p>
                <div className="mt-auto pt-6">
                  <Button href={m.href} variant={m.tone} size="lg">
                    {m.cta}
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-24 grid max-w-7xl gap-10 px-4 md:px-8 lg:grid-cols-2 lg:items-center" aria-labelledby="how-crowns">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ART.crowns} alt="" className="clip-panel aspect-[4/3] w-full object-cover" />
        <div>
          <h2 id="how-crowns" className="font-poster text-2xl font-extrabold uppercase md:text-4xl">
            How <span className="text-lime">Crowns</span> works
          </h2>
          <div className="mt-8">
            <StepList steps={CROWN_STEPS} tone="lime" />
          </div>
        </div>
      </section>

      <section className="mx-auto mt-24 grid max-w-7xl gap-10 px-4 md:px-8 lg:grid-cols-2 lg:items-center" aria-labelledby="how-duels">
        <div className="order-2 lg:order-1">
          <h2 id="how-duels" className="font-poster text-2xl font-extrabold uppercase md:text-4xl">
            How a <span className="text-pink">Duel</span> works
          </h2>
          <div className="mt-8">
            <StepList steps={DUEL_STEPS} tone="pink" />
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ART.artillery} alt="" className="clip-panel order-1 aspect-[4/3] w-full object-cover lg:order-2" />
      </section>

      <section className="mx-auto mt-24 grid max-w-7xl items-center gap-10 px-4 md:px-8 lg:grid-cols-[1fr_1fr] lg:gap-16" aria-labelledby="fair">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-pink">Fair play</p>
          <h2 id="fair" className="mt-2 font-poster text-2xl font-extrabold uppercase md:text-4xl">
            Nobody picks the winner
          </h2>
          <p className="mt-4 max-w-md text-mute">
            Your phone sends your moves, not your score. The CKB chain plays them again and works out the result itself, so nobody (not the host, not us)
            can change who wins.
          </p>
          <ol className="mt-8 divide-y divide-white/5 border-y border-white/5">
            {FAIR_PLAY_FACTS.map((f, i) => (
              <li key={f} className="flex items-baseline gap-4 py-4">
                <span className="font-poster text-sm font-black text-pink">0{i + 1}</span>
                <span className="font-semibold">{f}</span>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/verify" variant="pink" size="lg">
              Check any game
            </Button>
            <Button href="/how-it-works" variant="outline" size="lg">
              How it works
            </Button>
          </div>
        </div>

        {/* What a check looks like: the receipt every game gets, drawn as a card */}
        <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
          <div className="absolute -inset-6 rounded-[40px] bg-gradient-to-br from-lime/15 via-transparent to-pink/20 blur-2xl" />
          <div className="clip-panel relative bg-ink-2 p-6 md:p-8">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Duel · Artillery</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Replayed on chain</p>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <span className="font-poster text-lg font-black text-lime">@hii</span>
              <span className="font-poster text-sm font-black italic text-mute">VS</span>
              <span className="font-poster text-lg font-black text-pink">@samm</span>
            </div>
            <ul className="mt-6 space-y-3 font-mono text-[12px]">
              {[
                ['Stakes locked', '100 + 100 CKB'],
                ['Shots replayed', '23 of 23'],
                ['Winds matched', 'block by block'],
                ['Winner paid', '200 CKB'],
              ].map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-4 border-b border-dashed border-white/10 pb-3">
                  <span className="text-mute">{k}</span>
                  <span className="font-bold text-white">{v}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center justify-between gap-4">
              <span className="font-mono text-[10px] text-mute">0x7f3a…dc21e</span>
              <span className="-rotate-6 rounded-lg border-2 border-lime px-3 py-1.5 font-poster text-sm font-black uppercase text-lime">Checks out</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-7xl px-4 md:px-8" aria-labelledby="friends">
        <div className="relative overflow-hidden rounded-3xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ART.friends} alt="Friends on a couch cheering at a crown on the big screen" className="aspect-[4/5] w-full object-cover sm:aspect-[21/9]" />
          <div className="absolute inset-x-0 bottom-0 bg-ink/85 p-6 backdrop-blur-sm md:inset-y-0 md:left-0 md:right-auto md:flex md:w-[440px] md:flex-col md:justify-center md:p-10">
            <h2 id="friends" className="font-poster text-2xl font-extrabold uppercase md:text-3xl">
              Play with your friends
            </h2>
            <p className="mt-3 text-mute">Put a crown on the big screen and let the room scan in. Or send one friend a duel link.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
              <Button href="/create">Host a crown</Button>
              <Button href="/duels/new" variant="pink">
                Challenge a friend
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
