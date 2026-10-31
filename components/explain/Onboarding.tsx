'use client';

import { useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useUsername } from '@/hooks/useUsername';
import { ART } from '@/lib/art';

const SEEN_KEY = 'crowns-onboarded';
const SEEN_EVENT = 'crowns-onboarded';

const CARDS = [
  { title: 'Quick games. Real people.', body: 'Short arcade games you can win in a few minutes.', image: ART.hero },
  { title: 'Win real CKB', body: 'Hold a crown till the clock hits zero, or beat one player in a duel.', image: ART.duels },
  { title: 'Nobody can cheat', body: 'The blockchain replays every game before anyone gets paid.', image: ART.fairPlay },
];

function subscribe(onChange: () => void) {
  window.addEventListener(SEEN_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(SEEN_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function seenOnThisDevice(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    // Private mode or blocked storage: show it once per visit rather than never.
    return false;
  }
}

/** The first visit to the home page: three swipeable cards saying what Crowns is. */
export function Onboarding() {
  const seen = useSyncExternalStore(subscribe, seenOnThisDevice, () => true);
  const [i, setI] = useState(0);
  const [closed, setClosed] = useState(false);
  const router = useRouter();
  const { username } = useUsername();
  const open = !seen && !closed;

  const close = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Nothing to do: it simply shows again next visit.
    }
    setClosed(true);
    window.dispatchEvent(new Event(SEEN_EVENT));
  };
  // The last card leads a newcomer on to joining: connect, then claim a username.
  const finish = () => {
    close();
    if (!username?.username) router.push('/join?next=/games');
  };
  const next = () => (i < CARDS.length - 1 ? setI(i + 1) : finish());
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60 && i < CARDS.length - 1) setI(i + 1);
    if (info.offset.x > 60 && i > 0) setI(i - 1);
  };
  const card = CARDS[i]!;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to Crowns"
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/80 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-ink-2 sm:rounded-3xl"
          >
            <button type="button" onClick={close} aria-label="Skip intro" className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-xl bg-ink/70 text-white">
              <X className="h-5 w-5" />
            </button>
            <motion.div drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.2} onDragEnd={onDragEnd} className="touch-pan-y">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={card.image} alt="" className="pointer-events-none aspect-[4/3] w-full object-cover" draggable={false} />
                  <div className="px-6 pt-6 text-center">
                    <h2 className="font-poster text-xl font-extrabold uppercase">{card.title}</h2>
                    <p className="mx-auto mt-2 max-w-xs text-mute">{card.body}</p>
                  </div>
                </motion.div>
              </AnimatePresence>
            </motion.div>
            <div className="flex items-center justify-between gap-4 p-6">
              <div className="flex gap-1.5" aria-label={`Card ${i + 1} of ${CARDS.length}`}>
                {CARDS.map((c, idx) => (
                  <span key={c.title} className={`h-2 rounded-full transition-[width,background-color] duration-200 ${idx === i ? 'w-6 bg-lime' : 'w-2 bg-white/25'}`} />
                ))}
              </div>
              <Button onClick={next} size="lg">
                {i === CARDS.length - 1 ? (username?.username ? "Let's play" : 'Join and play') : 'Next'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
