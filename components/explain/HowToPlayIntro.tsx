'use client';

import { useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { STORY, StoryPicture } from '@/components/explain/StoryPicture';
import { Button } from '@/components/ui/Button';

const SEEN_KEY = 'crowns-intro-seen';
const SEEN_EVENT = 'crowns-intro-seen';

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

/** How to play, card by card with the pictures, the first time someone opens a game. */
export function HowToPlayIntro() {
  const seen = useSyncExternalStore(subscribe, seenOnThisDevice, () => true);
  const [step, setStep] = useState(0);
  const [closed, setClosed] = useState(false);
  if (seen || closed) return null;

  const card = STORY.at(step) ?? STORY[0];
  const last = step === STORY.length - 1;
  const done = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Nothing to do: it simply shows again next visit.
    }
    setClosed(true);
    window.dispatchEvent(new Event(SEEN_EVENT));
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/80 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="How to play">
      <div className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-ink-2 sm:rounded-3xl">
        <button type="button" onClick={done} aria-label="Skip intro" className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-xl bg-ink/70 text-white">
          <X className="h-5 w-5" />
        </button>
        <StoryPicture kind={card.kind} className="aspect-[4/3] border-0" />
        <div className="px-6 pt-6 text-center">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-lime">
            How to play · {step + 1} of {STORY.length}
          </p>
          <h2 className="mt-2 font-poster text-xl font-extrabold uppercase">{card.title}</h2>
          <p className="mx-auto mt-2 max-w-xs text-mute">{card.body}</p>
        </div>
        <div className="flex items-center justify-between gap-4 p-6">
          <div className="flex gap-1.5" aria-label={`Card ${step + 1} of ${STORY.length}`}>
            {STORY.map((item, index) => (
              <span key={item.kind} className={`h-2 rounded-full transition-[width,background-color] duration-200 ${index === step ? 'w-6 bg-lime' : 'w-2 bg-white/25'}`} />
            ))}
          </div>
          <Button size="lg" onClick={() => (last ? done() : setStep(step + 1))}>
            {last ? "Let's play" : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
