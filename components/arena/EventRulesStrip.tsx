'use client';

import type { EventPlayRules } from '@/types/event';
import { summarizePlayRules } from '@/types/event';

/** Compact rule chips for event detail / lobby / live. */
export function EventRulesStrip({
  playRules,
  turnSecs,
  questionSource,
  winnersCount,
}: {
  playRules?: EventPlayRules | null;
  turnSecs?: number;
  questionSource?: string | null;
  winnersCount?: number;
}) {
  if (!playRules) {
    return null;
  }

  const chips: string[] = [];
  if (playRules.growingPot) chips.push('Pot grows on valid moves');
  chips.push(
    playRules.winCondition === 'last_standing' ? 'Win · Last Standing' : 'Win · Highest Score',
  );
  chips.push(
    playRules.shrinkingClock
      ? `Clock · shrinks · ${turnSecs ?? 15}s start`
      : `Clock · resets · ${turnSecs ?? 15}s`,
  );
  if (playRules.accuracySpeed) chips.push('Speed bonus');
  if (questionSource) {
    chips.push(questionSource === 'ai' ? 'Questions · AI' : 'Questions · Manual');
  }
  if (winnersCount) chips.push(`${winnersCount} winner${winnersCount > 1 ? 's' : ''}`);

  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
        {summarizePlayRules(playRules)}
      </p>
      <ul className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <li
            key={c}
            className="border border-white/15 bg-black/40 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-white/70"
          >
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}
