'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Coins, Flame, Gauge, Magnet, Shield } from 'lucide-react';
import { RoadArt, UpgradeArt } from '@/components/game/RunArt';
import { Button } from '@/components/ui/Button';
import { COMBO, CROWN_RUN, DANGER, DANGER_BONUS, FORTUNE, MAGNET, OVERDRIVE, SAFE, SHIELD, UPGRADES, fallbackUpgrade, hasUpgrade, picksDue } from '@/lib/game/crown-run';

const ICONS = { [SHIELD]: Shield, [MAGNET]: Magnet, [OVERDRIVE]: Gauge, [FORTUNE]: Coins, [COMBO]: Flame } as const;

/** The upgrades a run holds, as small icons. */
export function UpgradeBadges({ owned, shieldReady, streak }: { owned: number; shieldReady?: boolean; streak?: number }) {
  return (
    <div className="flex items-center gap-1" aria-label="Your upgrades">
      {UPGRADES.filter((upgrade) => hasUpgrade(owned, upgrade.id)).map((upgrade) => {
        const Icon = ICONS[upgrade.id];
        const spent = upgrade.id === SHIELD && shieldReady === false;
        return (
          <span key={upgrade.id} title={upgrade.name} className={`inline-flex h-6 items-center gap-1 rounded-md px-1.5 font-mono text-[10px] font-bold ${spent ? 'bg-white/5 text-white/30' : 'bg-white/10 text-white'}`}>
            <Icon className="h-3.5 w-3.5" aria-label={spent ? `${upgrade.name}, used` : upgrade.name} />
            {upgrade.id === COMBO && streak ? streak : null}
          </span>
        );
      })}
    </div>
  );
}

/** A choice shown as a picture with its name and what it does. */
function PictureCard({
  on,
  tone,
  name,
  detail,
  badge,
  wide,
  onClick,
  children,
}: {
  on: boolean;
  tone: 'lime' | 'danger';
  name: string;
  detail: string;
  /** A short tag on the picture, like a road's bonus. */
  badge?: string;
  /** A shorter picture, for the two road cards. */
  wide?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const ring = tone === 'lime' ? 'ring-lime' : 'ring-danger';
  const mark = tone === 'lime' ? 'bg-lime' : 'bg-danger';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`relative flex flex-col overflow-hidden rounded-xl bg-ink-3 text-left ring-1 ring-white/10 transition-transform duration-150 ease-snap hover:bg-ink-4 ${on ? `-translate-y-0.5 ring-[3px] ${ring}` : ''}`}
    >
      <span className={`block w-full overflow-hidden ${wide ? 'aspect-[2/1]' : 'aspect-[3/2]'}`}>{children}</span>
      {badge ? (
        <span className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold ${tone === 'danger' ? 'bg-danger text-white' : 'bg-ink/80 text-white'}`}>{badge}</span>
      ) : null}
      {on ? (
        <span className={`absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-ink ${mark}`}>
          <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
        </span>
      ) : null}
      <span className="block flex-1 p-2.5">
        <span className="block font-poster text-xs font-bold uppercase leading-tight">{name}</span>
        <span className="mt-1 block text-[11px] leading-snug text-mute">{detail}</span>
      </span>
    </button>
  );
}

type Props = {
  /** The lap just finished, by its index from zero. */
  lap: number;
  owned: number;
  score: number;
  /** Seconds on the timer, or null for no timer. */
  seconds?: number | null;
  onPick: (upgrade: number | null, road: number) => void;
};

/** The choice after a clean lap: an upgrade after laps 1 to 3, and the next road after laps 1 to 4. */
export function RunPicks({ lap, owned, score, seconds = CROWN_RUN.PICK_SECONDS, onPick }: Props) {
  const wantsUpgrade = picksDue(lap) === 2;
  const [upgrade, setUpgrade] = useState<number | null>(null);
  const [road, setRoad] = useState<number | null>(null);
  const [left, setLeft] = useState(seconds);
  const choice = useRef({ upgrade, road });
  useEffect(() => {
    choice.current = { upgrade, road };
  }, [upgrade, road]);
  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (seconds == null) return;
    const ends = Date.now() + seconds * 1000;
    const timer = setInterval(() => {
      const now = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
      setLeft(now);
      if (now > 0) return;
      clearInterval(timer);
      // Time's up: keep whatever is chosen, and fill the rest with the least risky picks.
      const { upgrade: chosen, road: chosenRoad } = choice.current;
      pickRef.current(wantsUpgrade ? (chosen ?? fallbackUpgrade(owned)) : null, chosenRoad ?? SAFE);
    }, 250);
    return () => clearInterval(timer);
  }, [seconds, wantsUpgrade, owned]);

  const ready = road != null && (!wantsUpgrade || upgrade != null);
  const bonus = DANGER_BONUS[lap + 1] ?? 0;

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col overflow-y-auto px-4" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-lime">Lap {lap + 1} clear</p>
          <p className="font-poster text-3xl font-black tabular-nums">{score}</p>
        </div>
        {left != null ? (
          <p className={`font-mono text-2xl font-bold tabular-nums ${left <= 5 ? 'text-danger' : 'text-mute'}`} aria-label={`${left} seconds to choose`}>
            {left}s
          </p>
        ) : null}
      </div>

      {wantsUpgrade ? (
        <section className="mt-4">
          <h2 className="font-poster text-sm font-bold uppercase">Pick an upgrade</h2>
          <p className="text-xs text-mute">It starts on the next lap and lasts the whole run.</p>
          <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Upgrade">
            {UPGRADES.filter((item) => !hasUpgrade(owned, item.id)).map((item) => {
              const on = upgrade === item.id;
              return (
                <PictureCard key={item.id} on={on} tone="lime" name={item.name} detail={item.effect} onClick={() => setUpgrade(item.id)}>
                  <UpgradeArt id={item.id} />
                </PictureCard>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="mt-4">
        <h2 className="font-poster text-sm font-bold uppercase">Choose the next road</h2>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Next road">
          <PictureCard on={road === SAFE} tone="lime" name="Safe" detail="Fewer blocks. Normal coins." badge="No bonus" wide onClick={() => setRoad(SAFE)}>
            <RoadArt road={SAFE} />
          </PictureCard>
          <PictureCard on={road === DANGER} tone="danger" name="Danger" detail="More blocks, some moving. More coins. Finish the lap for the bonus." badge={`+${bonus}`} wide onClick={() => setRoad(DANGER)}>
            <RoadArt road={DANGER} />
          </PictureCard>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 mt-auto bg-ink px-4 pb-3 pt-3">
        <Button variant="lime" size="lg" block disabled={!ready} onClick={() => road != null && onPick(wantsUpgrade ? upgrade : null, road)}>
          Lock in my picks
        </Button>
        <p className="mt-2 text-center text-xs text-mute">You can&apos;t change these after locking in.</p>
      </div>
    </div>
  );
}
