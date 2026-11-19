'use client';

import Link from 'next/link';
import { useRef, type PointerEvent } from 'react';
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Gem } from 'lucide-react';
import { LatestRaces, LeaderboardBoard } from '@/components/crowns/Board';
import { OpenRaces, useOpenRaces } from '@/components/crowns/OpenRaces';
import { EASE, Reveal, SectionTitle, useDrift, useSectionProgress } from '@/components/crowns/motion';
import { buttonClass } from '@/components/ui/Button';
import { ckbWhole, useRallyStats } from '@/hooks/useRallyStats';
import { IMG, ITEM_IMG, MAP_ACCENT, MAP_IMG } from '@/lib/crowns/art';
import { ITEMS, MAPS, mapName } from '@/lib/rally/rules';

/** The front page: the hero, how a race works, open races, the tracks, the items, trophies, the board and why it's fair. */
export function HomeView() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <JoinNow />
      <Tracks />
      <Items />
      <Trophies />
      <HomeLeaderboard />
      <Fair />
      <FinalCta />
    </>
  );
}

function RaceButtons() {
  return (
    <>
      <Link href="/rally" className={`group ${buttonClass('lime', 'xl')}`}>
        Race now
        <ArrowRight className="h-6 w-6 transition-transform duration-200 ease-snap group-hover:translate-x-1" strokeWidth={3} aria-hidden="true" />
      </Link>
      <Link href="/rally/practice" className={buttonClass('ghost', 'xl')}>
        Practice free
      </Link>
    </>
  );
}

function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { open } = useOpenRaces();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const imgY = useTransform(scrollYProgress, [0, 1], reduce ? ['0%', '0%'] : ['0%', '22%']);
  const imgScale = useTransform(scrollYProgress, [0, 1], reduce ? [1.05, 1.05] : [1.08, 1.22]);
  const wordY = useTransform(scrollYProgress, [0, 1], reduce ? ['0%', '0%'] : ['0%', '-40%']);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const waiting = open.reduce((sum, { item }) => sum + item.match.seats - 1 - item.seats.length, 0);

  return (
    <section ref={ref} className="relative isolate flex min-h-[760px] flex-col justify-end overflow-hidden sm:min-h-[860px] lg:min-h-[920px]">
      <motion.img
        src={IMG.hero}
        alt="Four neon race cars side by side on a wet city street at night, sparks flying off the barrier"
        style={{ y: imgY, scale: imgScale }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="absolute inset-0 -z-20 h-full w-full object-cover object-[60%_center]"
      />
      {/* The words sit on the darkest part of the picture. */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/50 to-ink/20" />

      <motion.div style={{ y: wordY, opacity: fade }} className="mx-auto w-full max-w-[1440px] px-5 pb-12 sm:px-8 sm:pb-16 lg:pb-20">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: EASE, delay: 0.35 }}
          className="mb-4 inline-flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-sm font-semibold backdrop-blur"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-lime" />
          </span>
          {open.length === 0
            ? 'Live on CKB testnet'
            : `${open.length} open ${open.length === 1 ? 'race' : 'races'} · ${waiting} ${waiting === 1 ? 'seat' : 'seats'} free`}
        </motion.div>

        <h1 aria-label="Crowns" className="flex overflow-hidden font-display font-black uppercase leading-[0.8]">
          {'CROWNS'.split('').map((letter, i) => (
            <motion.span
              key={i}
              aria-hidden
              initial={{ y: '100%', skewX: -12 }}
              animate={{ y: '0%', skewX: 0 }}
              transition={{ duration: 0.3, ease: EASE, delay: 0.05 + i * 0.04 }}
              className={`inline-block text-[27vw] sm:text-[24vw] xl:text-[340px] ${i === 0 ? 'text-lime' : ''}`}
            >
              {letter}
            </motion.span>
          ))}
        </h1>

        <div className="mt-5 flex flex-col gap-6 sm:mt-6 lg:flex-row lg:items-end lg:justify-between">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE, delay: 0.3 }}
            className="max-w-xl font-display text-3xl font-extrabold uppercase leading-none sm:text-5xl"
          >
            Race live. <span className="text-lime">The winner gets paid automatically.</span>
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE, delay: 0.38 }}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <RaceButtons />
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}

const STEPS = [
  {
    title: 'Put in your entry',
    body: 'Everyone puts in the same entry fee in CKB. It all goes into one locked pot. Not even we can touch it.',
    img: IMG.stepEntry,
    alt: 'A glowing glass cell full of gold coins',
    tone: 'text-gold',
  },
  {
    title: 'Race live',
    body: '2 to 5 players. 3 laps. Same track, in real time.',
    img: IMG.stepRace,
    alt: 'Two neon cars drifting side by side through smoke and sparks',
    tone: 'text-pink',
  },
  {
    title: 'The winner gets paid',
    body: 'The race is checked move by move, then the winner is paid. Nobody finishes? Everyone gets their money back.',
    img: IMG.stepPayout,
    alt: 'A car crossing a glowing lime finish arch with a wireframe replay trailing behind it',
    tone: 'text-lime',
  },
];

function HowItWorks() {
  const { ref, progress } = useSectionProgress<HTMLElement>();
  const drifts = [useDrift(progress, 24), useDrift(progress, -36), useDrift(progress, 48)];
  return (
    <section ref={ref} id="how" className="relative mx-auto max-w-[1440px] px-5 py-24 sm:px-8 sm:py-32 lg:py-40">
      <SectionTitle kicker="How it works">
        Enter. Race.
        <br />
        <span className="text-lime">Get paid.</span>
      </SectionTitle>
      <ol className="mt-14 grid gap-12 sm:mt-20 md:grid-cols-3 md:gap-6 lg:gap-10">
        {STEPS.map((step, i) => (
          <motion.li key={step.title} style={{ y: drifts[i] }} className={`flex flex-col ${i === 1 ? 'md:mt-24' : i === 2 ? 'md:mt-48' : ''}`}>
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: '0px 0px -15% 0px' }}
              transition={{ duration: 0.3, ease: EASE, delay: i * 0.06 }}
              className="relative aspect-[4/5] overflow-hidden rounded-3xl"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={step.img} alt={step.alt} className="h-full w-full object-cover" />
              <span className={`absolute left-5 top-3 font-display text-[120px] font-black leading-none ${step.tone} drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:text-[140px]`}>
                {i + 1}
              </span>
            </motion.div>
            <h3 className="mt-6 font-display text-4xl font-black uppercase leading-none sm:text-5xl">{step.title}</h3>
            <p className="mt-3 max-w-sm text-lg text-fog">{step.body}</p>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}

/** Races anyone can join right now, straight from the chain. */
function JoinNow() {
  return (
    <section id="open" className="mx-auto max-w-[1440px] px-5 pb-24 sm:px-8 sm:pb-32">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <SectionTitle kicker="Open now">
          Grab a
          <br />
          <span className="text-lime">seat.</span>
        </SectionTitle>
        <Link href="/rally" className={`self-start lg:self-end ${buttonClass('ghost', 'md')}`}>
          Host a race <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-6 max-w-3xl">
        <OpenRaces limit={4} />
      </div>
    </section>
  );
}

const TRACK_ALT = [
  'A neon car speeding along a harbour quay at night past cranes and containers',
  'A car drifting a hairpin on a forest mountain road at dusk',
  'A car racing down a narrow cobbled street lit by warm lamps',
];

function Tracks() {
  return (
    <section id="tracks" className="relative py-24 sm:py-32">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-5 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
        <SectionTitle kicker="Three tracks">
          Pick your
          <br />
          battleground.
        </SectionTitle>
        <p className="max-w-xs text-lg text-fog">Every race is 3 laps. Learn the track in practice before you play for CKB.</p>
      </div>
      <div className="mx-auto mt-12 max-w-[1440px] sm:mt-16 sm:px-8">
        <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 [scrollbar-width:none] sm:px-0 lg:grid lg:grid-cols-[1.35fr_1fr_1fr] lg:gap-5 lg:overflow-visible lg:pb-0">
          {MAPS.map((map, i) => (
            <motion.li
              key={map.id}
              initial={{ opacity: 0, y: 48 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '0px 0px -10% 0px' }}
              transition={{ duration: 0.3, ease: EASE, delay: i * 0.06 }}
              className="w-[82%] shrink-0 snap-start sm:w-[58%] lg:w-auto"
            >
              <Link href="/rally" className="group relative block h-[520px] overflow-hidden rounded-3xl sm:h-[600px] lg:h-[680px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={MAP_IMG[map.id]}
                  alt={TRACK_ALT[map.id]}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-snap group-hover:scale-[1.04]"
                />
                <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-6 sm:p-8">
                  <div className="min-w-0">
                    <span className={`mb-4 block h-1.5 w-12 rounded-full ${MAP_ACCENT[map.id]}`} />
                    <h3 className="font-display text-5xl font-black uppercase leading-[0.9] sm:text-6xl">{map.name}</h3>
                    <p className="mt-3 max-w-xs text-base text-chalk/80">{map.about}</p>
                  </div>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-chalk text-ink transition-transform duration-200 ease-snap group-hover:rotate-45">
                    <ArrowUpRight className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
                  </span>
                </div>
              </Link>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Items() {
  const { ref, progress } = useSectionProgress<HTMLElement>();
  const bgY = useDrift(progress, 60);
  const items = ITEMS.map((item, id) => ({ item, id })).filter((entry): entry is { item: NonNullable<(typeof ITEMS)[number]>; id: number } => entry.item != null);
  return (
    <section ref={ref} id="items" className="relative overflow-hidden">
      <div className="relative h-[460px] overflow-hidden sm:h-[560px] lg:h-[640px]">
        <motion.img
          src={IMG.itemsScene}
          alt="Cars on a neon track using a speed trail, an electric shock, an oil slick and a gold barricade"
          style={{ y: bgY }}
          className="absolute inset-x-0 top-[-80px] h-[calc(100%+160px)] w-full scale-105 object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-transparent to-ink" />
        <div className="relative mx-auto max-w-[1440px] px-5 pt-20 sm:px-8 sm:pt-28">
          <SectionTitle kicker={`${items.length} items`}>
            Play dirty.
            <br />
            <span className="text-pink">Fairly.</span>
          </SectionTitle>
        </div>
      </div>
      <div className="mx-auto -mt-16 max-w-[1440px] px-5 pb-24 sm:-mt-24 sm:px-8 sm:pb-32">
        <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-4">
          {items.map(({ item, id }, i) => (
            <motion.li
              key={id}
              initial={{ opacity: 0, y: 32, scale: 0.96 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: '0px 0px -10% 0px' }}
              transition={{ duration: 0.3, ease: EASE, delay: (i % 4) * 0.05 }}
              className="flex flex-col items-center text-center"
            >
              <motion.div
                whileHover={{ y: -6, rotate: -3 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="relative h-36 w-36 sm:h-44 sm:w-44"
                style={{ filter: `drop-shadow(0 0 32px ${item.color}59)` }}
              >
                {ITEM_IMG[id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ITEM_IMG[id]} alt="" className="h-full w-full rounded-full object-cover mix-blend-screen" />
                ) : (
                  <span
                    className="grid h-full w-full place-items-center rounded-full font-display text-6xl font-black"
                    style={{ background: `radial-gradient(circle, ${item.color}66 0%, ${item.color}1a 55%, transparent 72%)`, color: item.color }}
                    aria-hidden="true"
                  >
                    {item.name.slice(0, 1)}
                  </span>
                )}
              </motion.div>
              <h3 className="mt-3 font-display text-4xl font-black uppercase leading-none" style={{ color: item.color }}>
                {item.name}
              </h3>
              <p className="mt-2 max-w-[16rem] text-base text-chalk/80">{item.about}</p>
            </motion.li>
          ))}
        </ul>
        <p className="mx-auto mt-14 max-w-md text-center text-fog">Drive over a pad to pick one up. Balanced with bot races: none of them is a free win.</p>
      </div>
    </section>
  );
}

function Trophies() {
  const reduce = useReducedMotion();
  const stats = useRallyStats();
  const latestWin = stats.data?.races.find((race) => race.winners.length > 0);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotY = useSpring(useTransform(mx, [-0.5, 0.5], reduce ? [0, 0] : [-10, 10]), { stiffness: 220, damping: 22 });
  const rotX = useSpring(useTransform(my, [-0.5, 0.5], reduce ? [0, 0] : [8, -8]), { stiffness: 220, damping: 22 });

  function onMove(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  }

  return (
    <section id="trophies" className="relative mx-auto max-w-[1440px] px-5 py-24 sm:px-8 sm:py-32">
      <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
        <div
          className="[perspective:1200px]"
          onPointerMove={onMove}
          onPointerLeave={() => {
            mx.set(0);
            my.set(0);
          }}
        >
          <motion.figure
            initial={{ opacity: 0, scale: 0.96, y: 40 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true, margin: '0px 0px -15% 0px' }}
            transition={{ duration: 0.3, ease: EASE }}
            style={{ rotateX: rotX, rotateY: rotY }}
            className="relative overflow-hidden rounded-[28px] border border-gold/40 bg-black shadow-[0_40px_120px_-30px_rgba(225,191,71,0.35)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={IMG.trophy} alt="A gold crown trophy set with green gems on a black pedestal" className="aspect-square w-full object-cover" />
            <figcaption className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 bg-gradient-to-t from-black via-black/80 to-transparent p-5 pt-16 sm:p-7 sm:pt-20">
              <div>
                <p className="font-display text-sm font-extrabold uppercase tracking-wider text-gold">{latestWin ? 'Trophy · latest win' : 'Trophy'}</p>
                <p className="mt-1 font-display text-3xl font-black uppercase leading-none sm:text-4xl">{mapName(latestWin?.map ?? 0)}</p>
              </div>
              {latestWin ? (
                <dl className="flex gap-6 text-right">
                  <div>
                    <dt className="text-xs text-fog">Pot</dt>
                    <dd className="font-display text-2xl font-black text-gold">{ckbWhole(latestWin.pot)} CKB</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fog">Racers</dt>
                    <dd className="font-display text-2xl font-black">{latestWin.players.length}</dd>
                  </div>
                </dl>
              ) : null}
            </figcaption>
          </motion.figure>
        </div>
        <div>
          <SectionTitle kicker="Trophies">
            Win it.
            <br />
            <span className="text-gold">Keep it.</span>
          </SectionTitle>
          <Reveal delay={0.05}>
            <p className="mt-6 max-w-md text-xl text-chalk/85">
              Win a race and claim a crown. It’s a collectible you own, and you can only get one for a race you really won. The CKB inside it stays yours.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mt-10 flex items-start gap-4 border-t border-line pt-8">
              <Gem className="mt-1 h-7 w-7 shrink-0 text-pink" strokeWidth={2} aria-hidden="true" />
              <div>
                <h3 className="font-display text-3xl font-black uppercase leading-none">Shards</h3>
                <p className="mt-2 max-w-sm text-fog">Grab them from pads during races. They show on your profile and the leaderboard.</p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function HomeLeaderboard() {
  return (
    <section id="leaderboard" className="mx-auto max-w-[1440px] px-5 py-24 sm:px-8 sm:py-32">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <SectionTitle kicker="Leaderboard">
          Who wears
          <br />
          <span className="text-gold">the crown.</span>
        </SectionTitle>
        <Link href="/leaderboard" className={`self-start lg:self-end ${buttonClass('ghost', 'md')}`}>
          Full leaderboard <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-12 grid gap-16 lg:grid-cols-[1fr_1.15fr] lg:gap-20">
        <Reveal>
          <LeaderboardBoard limit={6} />
        </Reveal>
        <Reveal delay={0.06}>
          <h3 className="mb-4 font-display text-3xl font-black uppercase">Latest races</h3>
          <LatestRaces limit={5} />
        </Reveal>
      </div>
    </section>
  );
}

const FAIR = [
  { claim: 'Every race is checked.', detail: 'When a race ends, it’s replayed from each player’s own moves to confirm the winner.' },
  { claim: 'Your money stays locked, not with us.', detail: 'We never hold it. If our race server goes down, everyone gets their money back after 10 minutes.' },
  { claim: 'Nobody can take the pot.', detail: 'Not us, not anyone. Only the race result decides who gets paid.' },
];

function Fair() {
  return (
    <section id="fair-play" className="bg-lime text-ink">
      <div className="mx-auto max-w-[1440px] px-5 py-20 sm:px-8 sm:py-28 lg:py-32">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.6fr] lg:gap-16">
          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '0px 0px -10% 0px' }}
            transition={{ duration: 0.3, ease: EASE }}
            className="font-display text-[64px] font-black uppercase leading-[0.85] sm:text-[96px] lg:sticky lg:top-24 lg:self-start lg:text-[120px]"
          >
            Why it’s fair
          </motion.h2>
          <ul className="border-t-2 border-ink">
            {FAIR.map((point, i) => (
              <motion.li
                key={point.claim}
                initial={{ opacity: 0, x: 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '0px 0px -10% 0px' }}
                transition={{ duration: 0.3, ease: EASE, delay: i * 0.06 }}
                className="border-b-2 border-ink py-8 sm:py-10"
              >
                <p className="font-display text-4xl font-black uppercase leading-[0.95] sm:text-6xl">{point.claim}</p>
                <p className="mt-3 max-w-lg text-lg font-medium text-ink/75">{point.detail}</p>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  const { ref, progress } = useSectionProgress<HTMLElement>();
  const bgY = useDrift(progress, 50);
  return (
    <section ref={ref} className="relative isolate overflow-hidden">
      <motion.img
        src={IMG.grid}
        alt="Five cars lined up on a wet starting grid under green start lights"
        style={{ y: bgY }}
        className="absolute inset-x-0 top-[-60px] -z-20 h-[calc(100%+120px)] w-full object-cover object-top"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/60 to-ink/10" />
      <div className="mx-auto flex min-h-[620px] max-w-[1440px] flex-col items-center justify-end px-5 pb-16 text-center sm:min-h-[720px] sm:px-8 sm:pb-24">
        <motion.h2
          initial={{ opacity: 0, scale: 0.96, y: 24 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, margin: '0px 0px -10% 0px' }}
          transition={{ duration: 0.3, ease: EASE }}
          className="font-display text-[64px] font-black uppercase leading-[0.85] sm:text-[120px] lg:text-[160px]"
        >
          Lights <span className="text-lime">out.</span>
        </motion.h2>
        <p className="mt-4 text-xl text-chalk/85">Five cars. One pot. One crown.</p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <RaceButtons />
        </div>
      </div>
    </section>
  );
}
