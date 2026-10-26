'use client';

import { useState, useSyncExternalStore } from 'react';
import { STORY, StoryPicture } from '@/components/explain/StoryPicture';

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

/**
 * How to play, card by card with the pictures, the first time someone opens a game. It can be
 * skipped and does not come back on this device. The server renders nothing, so nobody sees a flash.
 */
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
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="How to play">
      <div className="w-full max-w-md border border-white/15 bg-[#111]">
        <StoryPicture kind={card.kind} className="aspect-[16/10] border-0 border-b" />
        <div className="p-5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#99ee2d]">
            How to play · {step + 1} of {STORY.length}
          </p>
          <h2 className="mt-2 font-poster text-2xl uppercase leading-none text-white">{card.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/70">{card.body}</p>
          <div className="mt-6 flex items-center justify-between gap-3">
            <button type="button" onClick={done} className="font-mono text-[11px] uppercase text-white/50">
              Skip
            </button>
            <div className="flex items-center gap-3">
              <span className="flex gap-1.5" aria-hidden>
                {STORY.map((item, index) => (
                  <span key={item.kind} className={`h-1.5 w-4 ${index === step ? 'bg-[#99ee2d]' : 'bg-white/20'}`} />
                ))}
              </span>
              <button
                type="button"
                onClick={() => (last ? done() : setStep(step + 1))}
                className="arena-cta px-4 py-2 font-mono text-[11px] font-bold uppercase"
              >
                {last ? "Let's play" : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
