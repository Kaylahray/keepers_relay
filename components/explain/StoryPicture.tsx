/**
 * Four small drawings that each carry one idea of the game, used on the home page, the first-visit
 * intro and How it works. Our own art: shapes in the app's colours, no image files.
 */

export type StoryKind = 'race' | 'grab' | 'win' | 'fair';

const LIME = '#99ee2d';
const PINK = '#ff56f6';
const GOLD = '#e1bf47';
const BLUE = '#406aff';
const INK = '#0b0b12';

function Crown({ x, y, size = 1, color = GOLD }: { x: number; y: number; size?: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      <path d="M-22 10 L-22 -8 L-11 2 L0 -14 L11 2 L22 -8 L22 10 Z" fill={color} />
      <rect x="-22" y="12" width="44" height="6" rx="2" fill={color} />
      <circle cx="0" cy="-16" r="3.5" fill={color} />
      <circle cx="-22" cy="-10" r="3" fill={color} />
      <circle cx="22" cy="-10" r="3" fill={color} />
    </g>
  );
}

function Race() {
  // The real game, rendered from the 3D night drive.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/arena/drive-wide.jpg" alt="" aria-hidden className="h-full w-full object-cover" />;
}

function Grab() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden>
      <rect width="320" height="200" fill={INK} />
      <circle cx="74" cy="104" r="30" fill="#1b1e2b" stroke="#ffffff40" strokeWidth="2" />
      <text x="74" y="110" textAnchor="middle" fontSize="18" fontWeight="700" fill="#ffffffb3">388</text>
      <circle cx="246" cy="104" r="30" fill="#1b1e2b" stroke={LIME} strokeWidth="3" />
      <text x="246" y="110" textAnchor="middle" fontSize="18" fontWeight="700" fill={LIME}>412</text>
      <path d="M104 78 Q160 20 216 78" fill="none" stroke={GOLD} strokeWidth="3" strokeDasharray="6 6" />
      <polygon points="216,78 204,70 214,62" fill={GOLD} />
      <Crown x={160} y={48} size={0.75} />
      <Crown x={246} y={64} size={0.55} />
      <rect x="40" y="160" width="110" height="14" rx="7" fill="#ffffff1a" />
      <rect x="40" y="160" width="86" height="14" rx="7" fill={LIME} />
      <text x="40" y="152" fontSize="12" fill="#ffffffb3">Prize +50</text>
      <circle cx="246" cy="167" r="18" fill="none" stroke="#ffffff33" strokeWidth="6" />
      <path d="M246 149 A18 18 0 1 1 228.2 170" fill="none" stroke={PINK} strokeWidth="6" />
      <text x="200" y="152" fontSize="12" fill="#ffffffb3">Clock −</text>
    </svg>
  );
}

function Win() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden>
      <rect width="320" height="200" fill={INK} />
      <circle cx="92" cy="100" r="46" fill="none" stroke="#ffffff26" strokeWidth="8" />
      <text x="92" y="110" textAnchor="middle" fontSize="28" fontWeight="800" fill="#ffffff">0:00</text>
      <circle cx="232" cy="118" r="32" fill="#1b1e2b" stroke={LIME} strokeWidth="3" />
      <Crown x={232} y={74} size={0.7} />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={150 + i * 14} cy={150 - (i % 2) * 10} r="7" fill={GOLD} opacity={0.5 + i * 0.1} />
      ))}
      <text x="232" y="124" textAnchor="middle" fontSize="13" fontWeight="700" fill={LIME}>WINNER</text>
      <text x="232" y="176" textAnchor="middle" fontSize="14" fontWeight="700" fill={GOLD}>+ whole prize</text>
    </svg>
  );
}

function Fair() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden>
      <rect width="320" height="200" fill={INK} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={22 + (i % 2) * 44} y={44 + Math.floor(i / 2) * 32} width="38" height="22" rx="4" fill="none" stroke={PINK} strokeWidth="2" />
      ))}
      <text x="64" y="160" textAnchor="middle" fontSize="12" fill="#ffffffb3">your moves</text>
      <path d="M118 100 H150" stroke="#ffffff66" strokeWidth="3" />
      <polygon points="150,92 162,100 150,108" fill="#ffffff66" />
      <rect x="166" y="64" width="68" height="72" rx="10" fill="#14183a" stroke={BLUE} strokeWidth="3" />
      <text x="200" y="98" textAnchor="middle" fontSize="16" fontWeight="800" fill="#9db3ff">CKB</text>
      <text x="200" y="118" textAnchor="middle" fontSize="10" fill="#9db3ff">replays it</text>
      <path d="M238 100 H254" stroke="#ffffff66" strokeWidth="3" />
      <polygon points="254,92 266,100 254,108" fill="#ffffff66" />
      <circle cx="286" cy="100" r="20" fill={LIME} />
      <path d="M276 100 L283 108 L297 92" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <text x="280" y="146" textAnchor="middle" fontSize="11" fill="#ffffffb3">same score</text>
    </svg>
  );
}

export function StoryPicture({ kind, className = '' }: { kind: StoryKind; className?: string }) {
  return (
    <div className={`overflow-hidden border border-white/10 ${className}`}>
      {kind === 'race' ? <Race /> : kind === 'grab' ? <Grab /> : kind === 'win' ? <Win /> : <Fair />}
    </div>
  );
}

/** The game in five lines, said the way you'd tell a friend. Shared by every page that explains it. */
export const STORY = [
  { kind: 'race' as const, title: 'Race for free', body: 'Everyone plays the same short race on their phone. Practise as much as you like.' },
  { kind: 'grab' as const, title: 'Beat the best score', body: 'Beat it and you can grab the crown. Your entry goes into the prize, and the clock gets shorter.' },
  { kind: 'win' as const, title: 'Hold it at zero', body: 'Whoever holds the crown when the clock hits zero wins the whole prize.' },
  { kind: 'fair' as const, title: 'Nobody can cheat the score', body: 'The CKB chain replays your moves itself, so the score is the same for everyone.' },
];
