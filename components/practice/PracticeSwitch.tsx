import Link from 'next/link';

/** Which game to practise, at the top of the practice page. */
export function PracticeSwitch({ game }: { game: 'crown-run' | 'depths' }) {
  const tab = (id: 'crown-run' | 'depths', label: string, href: string) => (
    <Link
      href={href}
      aria-current={game === id ? 'page' : undefined}
      className={`flex-1 rounded-xl px-4 py-3 text-center font-poster text-sm font-bold uppercase ${game === id ? 'bg-lime text-ink' : 'bg-ink-3 text-mute hover:text-white'}`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Pick a game to practise" className="mb-6 flex gap-2">
      {tab('crown-run', 'Crown Run', '/practice')}
      {tab('depths', 'Crown Depths', '/practice?game=depths')}
    </nav>
  );
}
