import { UserPlus } from 'lucide-react';
import { Avatar } from '@/components/duel/Avatar';
import { SIDE_COLORS } from '@/components/duel/colors';
import { Ckb, HpBlocks } from '@/components/ui/kit';

/** The face-off at the top of every duel: both players, what each put in, and what the winner takes. */
export function VsBanner({
  names,
  stakeCkb,
  game,
  active,
  hp,
  pictures = [null, null],
  stage = 'live',
}: {
  names: [string, string];
  stakeCkb: number;
  game: string;
  active: 0 | 1 | null;
  hp?: [number, number] | null;
  /** Each player's own profile picture, when they have one. */
  pictures?: [string | null, string | null];
  /** `open`: waiting for the opponent's stake. `cancelled`: taken back before anyone accepted. */
  stage?: 'open' | 'cancelled' | 'live';
}) {
  return (
    <section aria-label="Duel summary" className="clip-panel relative overflow-hidden bg-ink-2 px-5 py-6 md:px-10 md:py-8">
      <div className="absolute inset-y-0 left-0 w-1/2 bg-lime/[0.06]" aria-hidden="true" />
      <div className="absolute inset-y-0 right-0 w-1/2 bg-pink/[0.06]" aria-hidden="true" />
      <div className="relative flex items-start gap-3">
        {([0, 1] as const).map((side) => {
          const tone = SIDE_COLORS[side];
          const lit = active === side;
          const empty = stage === 'open' && side === 1 && names[1] === 'Open seat';
          const note =
            stage === 'cancelled' ? (side === 0 ? 'Stake returned' : 'Never joined') : stage === 'open' && side === 1 ? `${stakeCkb} CKB to join` : `${stakeCkb} CKB in`;
          return (
            <div key={side} className={`flex min-w-0 flex-1 flex-col items-center gap-3 ${side === 0 ? 'md:items-start' : 'order-3 md:items-end'}`}>
              {empty ? (
                <span className="grid h-20 w-20 place-items-center rounded-[22px] border-2 border-dashed border-pink/60 text-pink">
                  <UserPlus className="h-8 w-8" aria-hidden="true" />
                </span>
              ) : (
                <div className={`rounded-[22%] ${lit ? 'animate-pulse' : ''}`} style={lit ? { boxShadow: `0 0 0 3px #191919, 0 0 0 5px ${tone}` } : undefined}>
                  <Avatar name={names[side]} tone={tone} size={80} src={pictures[side]} />
                </div>
              )}
              <div className={`min-w-0 text-center ${side === 0 ? 'md:text-left' : 'md:text-right'}`}>
                <p className="truncate font-poster text-sm font-bold" style={{ color: tone }}>
                  {empty ? 'Anyone' : names[side]}
                </p>
                <p className="font-mono text-[10px] text-mute">{note}</p>
                {hp ? (
                  <div className={`mt-2 flex ${side === 1 ? 'justify-end' : ''}`}>
                    <HpBlocks hp={hp[side]} tone={side === 0 ? 'lime' : 'pink'} size="sm" align={side === 1 ? 'right' : 'left'} />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        <div className="order-2 flex shrink-0 flex-col items-center pt-5">
          <span className="font-poster text-3xl font-black italic text-white md:text-5xl">VS</span>
          <span className="mt-2 font-mono text-[10px] text-mute">{game}</span>
        </div>
      </div>
      <div className="relative mt-6 flex flex-col items-center gap-1 border-t border-white/10 pt-5">
        {stage === 'cancelled' ? (
          <p className="font-mono text-[11px] uppercase tracking-wider text-mute">Challenge cancelled</p>
        ) : (
          <>
            <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Winner takes</p>
            <Ckb value={stakeCkb * 2} size="xl" />
            <p className="mt-2 text-center text-xs text-mute">The storage deposit comes back when the duel ends.</p>
          </>
        )}
      </div>
    </section>
  );
}
