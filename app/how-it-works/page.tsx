import type { Metadata } from 'next';
import { CROWN_STEPS, DUEL_STEPS, StepList } from '@/components/explain/StepList';
import { Button } from '@/components/ui/Button';
import { LapBoxes } from '@/components/ui/kit';
import { ART } from '@/lib/art';

export const metadata: Metadata = {
  title: 'How it works — Crowns',
  description: 'Two ways to play for real CKB: grab the crown against everyone, or duel one player. The chain replays every game before it pays.',
};

/** Crowns, in detail: a sentence or two each, for anyone who wants more than the four steps. */
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
    body: 'Practice is always free. To play for real you pay an entry, and your phone does a few seconds of work first, so nobody can open hundreds of roads for free. If you grab the crown, the fee goes into the prize. If not, you get your entry back after the game.',
  },
  {
    title: 'Your road',
    body: 'A run is 5 laps of 24 seconds. Each lap’s road is made from the block where your last lap was sealed, so nobody, not even you, sees a lap before the one before it is locked in. Practise a lap as often as you like, then seal it: your browser signs, no wallet pops up. The road also reacts to your moves, and someone copying your moves would crash on their own road.',
  },
  {
    title: 'Holding the crown',
    body: "You can't grab the crown from yourself. To win, keep it until the clock hits zero.",
  },
  {
    title: 'Ending the game',
    body: 'When the clock hits zero, any open game page ends it by itself, with no wallet needed. The prize goes to whoever holds the crown, and unused entries go back to their owners.',
  },
  {
    title: 'Too late is too late',
    body: 'The chain stamps every grab with the time it landed. A grab that lands after the clock ran out still shows up, but it can never win: the prize goes to the last player who grabbed in time.',
  },
];

/** Duels, in detail. */
const DUEL_DETAILS = [
  {
    title: 'The stakes',
    body: 'You pick the stake. When your opponent accepts, they lock the same amount next to yours, in a cell only the duel script can open. Before anyone accepts, you can cancel and take yours back.',
  },
  {
    title: 'The games',
    body: 'Artillery: take turns firing over the tower, with angle, power and the wind. Lane race: both drive the same five laps; the higher score wins.',
  },
  {
    title: 'The turn timer',
    body: 'Classic gives every turn the same time. Pressure takes 5 seconds off each turn, never under 30. Run out of time and your turn passes to the other player. Nobody is paid for a missed turn.',
  },
  {
    title: 'The end',
    body: 'A duel ends when a tank is destroyed, or after 30 turns (the healthier tank wins). The chain replays every shot, then pays the winner both stakes by itself. A draw gives each stake back.',
  },
];

const CHAIN_FLOW = [
  { title: 'You play', body: 'Every shot or lap you make is signed in your browser. No wallet pops up mid-game.' },
  { title: 'Moves land on the chain', body: 'Each one is stored in a block, with the time and wind of that block.' },
  { title: 'The chain replays it', body: 'Before paying anyone, the contract runs the whole game again from those moves.' },
  { title: 'The real winner is paid', body: 'If the replay agrees, the prize goes out. If not, nobody gets paid.' },
];

const STAKE_LIFE = [
  { when: 'You lock it', what: 'Your stake goes into a smart contract. Not to us, not to the other player.' },
  { when: 'You win', what: 'You get both stakes (duel) or the whole pot (crown).' },
  { when: 'It is a draw', what: 'Each stake goes back to its owner.' },
  { when: 'You cancel early', what: 'Before anyone accepts, your stake comes straight back.' },
  { when: 'Someone misses a turn', what: 'The turn passes to the other player. Nobody is paid for a missed turn.' },
  { when: 'Your entry goes unused', what: 'If you never took the crown, your crown entry comes back after the game.' },
];

const FEES = [
  { name: 'Stake or entry', amount: 'You choose', note: 'Goes to the winner.' },
  { name: 'Network fee', amount: 'Under 0.01 CKB', note: 'A tiny fee paid to the network for each move.' },
  { name: 'Storage deposit', amount: 'Comes back', note: 'CKB held while a game is open, for its storage on chain. It returns to you when the game ends.' },
];

function Details({ items, tone }: { items: { title: string; body: string }[]; tone: 'lime' | 'pink' }) {
  return (
    <dl className="mt-6 divide-y divide-white/5 rounded-2xl bg-ink-2">
      {items.map((detail) => (
        <div key={detail.title} className="grid gap-1 px-5 py-4 md:grid-cols-[220px_1fr] md:gap-6">
          <dt className={`font-semibold ${tone === 'lime' ? 'text-lime' : 'text-pink'}`}>{detail.title}</dt>
          <dd className="text-mute">{detail.body}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function HowItWorksPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 md:px-8 md:pt-12">
      <section className="grid items-center gap-8 lg:grid-cols-2">
        <div>
          <h1 className="font-poster text-3xl font-black uppercase md:text-5xl">How it works</h1>
          <p className="mt-4 max-w-md text-lg text-mute">Quick games, real stakes, and a referee nobody can bribe: the blockchain itself.</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ART.fairPlay} alt="A friendly robot referee checks a replay" className="clip-panel aspect-[4/3] w-full object-cover" />
      </section>

      <section className="mt-20 grid gap-10 md:grid-cols-2" aria-label="The two modes">
        <div className="rounded-3xl bg-ink-2 p-6 md:p-8">
          <h2 className="font-poster text-2xl font-black uppercase text-lime">Crowns</h2>
          <p className="mt-1 text-sm text-mute">Many players. King of the hill.</p>
          <div className="mt-6">
            <StepList steps={CROWN_STEPS} tone="lime" />
          </div>
        </div>
        <div className="rounded-3xl bg-ink-2 p-6 md:p-8">
          <h2 className="font-poster text-2xl font-black uppercase text-pink">Duels</h2>
          <p className="mt-1 text-sm text-mute">You vs one player. Artillery or Lane race.</p>
          <div className="mt-6">
            <StepList steps={DUEL_STEPS} tone="pink" />
          </div>
        </div>
      </section>

      <section className="mt-20" aria-labelledby="replay">
        <h2 id="replay" className="font-poster text-2xl font-black uppercase md:text-3xl">
          The chain replays every game
        </h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-4">
          {CHAIN_FLOW.map((s, i) => (
            <li key={s.title} className="relative">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-pink font-poster font-black text-ink">{i + 1}</span>
                {i < CHAIN_FLOW.length - 1 ? <span className="hidden h-0.5 flex-1 bg-pink/40 md:block" aria-hidden="true" /> : null}
              </div>
              <h3 className="mt-4 font-poster text-sm font-bold uppercase">{s.title}</h3>
              <p className="mt-1 text-sm text-mute">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-20 grid items-center gap-8 rounded-3xl bg-ink-2 p-6 md:grid-cols-2 md:p-10" aria-labelledby="laps">
        <div>
          <h2 id="laps" className="font-poster text-2xl font-black uppercase">
            Why runs come in laps
          </h2>
          <p className="mt-3 text-mute">
            A run is 5 short laps, and you seal each one as you go. Short laps are quick for the chain to replay, and they are hard for bots to fake: each lap&apos;s road is made from the
            block your last lap landed in, so nobody can know it in advance.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-ink p-6">
          <LapBoxes states={['done', 'done', 'crash', 'empty', 'empty']} scores={[312, 298]} />
          <p className="text-center text-sm text-mute">Two laps sealed, one crash to run again.</p>
        </div>
      </section>

      <section className="mt-20" aria-labelledby="crowns-detail">
        <h2 id="crowns-detail" className="font-poster text-2xl font-black uppercase md:text-3xl">
          <span className="text-lime">Crowns</span> in detail
        </h2>
        <Details items={DETAILS} tone="lime" />
      </section>

      <section className="mt-16" aria-labelledby="duels-detail">
        <h2 id="duels-detail" className="font-poster text-2xl font-black uppercase md:text-3xl">
          <span className="text-pink">Duels</span> in detail
        </h2>
        <Details items={DUEL_DETAILS} tone="pink" />
      </section>

      <section className="mt-20" aria-labelledby="stake">
        <h2 id="stake" className="font-poster text-2xl font-black uppercase md:text-3xl">
          What happens to your stake
        </h2>
        <dl className="mt-6 divide-y divide-white/5 rounded-2xl bg-ink-2">
          {STAKE_LIFE.map((s) => (
            <div key={s.when} className="grid gap-1 px-5 py-4 md:grid-cols-[220px_1fr] md:gap-6">
              <dt className="font-semibold">{s.when}</dt>
              <dd className="text-mute">{s.what}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-20" aria-labelledby="fees">
        <h2 id="fees" className="font-poster text-2xl font-black uppercase md:text-3xl">
          Fees and deposits
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {FEES.map((f) => (
            <div key={f.name} className="flex flex-col rounded-2xl bg-ink-2 p-5">
              <p className="text-sm text-mute">{f.name}</p>
              <p className="mt-1 font-poster text-2xl font-black text-gold">{f.amount}</p>
              <p className="mt-3 text-sm text-mute">{f.note}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-16 flex flex-wrap gap-3">
        <Button href="/verify" variant="pink" size="lg">
          Check a game yourself
        </Button>
        <Button href="/games" size="lg">
          Start playing
        </Button>
      </div>
    </div>
  );
}
