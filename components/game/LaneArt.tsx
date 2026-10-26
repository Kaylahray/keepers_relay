/**
 * The lane runner as players see it: a still rendered from the real 3D night drive
 * (lib/game/night-drive.ts), so the picture matches the game. Wide for cards, tall for side panels.
 */
export function LaneArt({ className = '', shape = 'wide' }: { className?: string; shape?: 'wide' | 'tall' }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={shape === 'tall' ? '/arena/drive-hero.jpg' : '/arena/drive-wide.jpg'}
      alt=""
      aria-hidden
      className={`bg-[#0b0b12] object-cover ${shape === 'tall' ? 'object-top' : 'object-center'} ${className}`}
    />
  );
}
