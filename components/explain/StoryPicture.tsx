import { LaneArt } from '@/components/game/LaneArt';

/** Four small drawings that each carry one idea of the game, used on the home page, the first-visit intro and How it works. */

export type StoryKind = 'race' | 'grab' | 'win' | 'fair' | 'stake' | 'fight' | 'collect';

const LIME = '#99ee2d';
const PINK = '#ff56f6';
const GOLD = '#e1bf47';
const BLUE = '#406aff';
const INK = '#191919';

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
  return <LaneArt className="h-full w-full" />;
}

function Grab() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden>
      <rect width="320" height="200" fill={INK} />
      <circle cx="74" cy="104" r="30" fill="#232323" stroke="#ffffff40" strokeWidth="2" />
      <text x="74" y="110" textAnchor="middle" fontSize="18" fontWeight="700" fill="#ffffffb3">388</text>
      <circle cx="246" cy="104" r="30" fill="#232323" stroke={LIME} strokeWidth="3" />
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
      <circle cx="232" cy="118" r="32" fill="#232323" stroke={LIME} strokeWidth="3" />
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

function Face({ x, color, label }: { x: number; color: string; label: string }) {
  return (
    <g>
      <circle cx={x} cy="78" r="26" fill="#232323" stroke={color} strokeWidth="3" />
      <circle cx={x - 8} cy="74" r="3" fill={color} />
      <circle cx={x + 8} cy="74" r="3" fill={color} />
      <path d={`M${x - 9} 86 Q${x} 93 ${x + 9} 86`} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <text x={x} y="124" textAnchor="middle" fontSize="12" fill="#ffffffb3">{label}</text>
    </g>
  );
}

function Stake() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden>
      <rect width="320" height="200" fill={INK} />
      <Face x={60} color={LIME} label="you" />
      <Face x={260} color={PINK} label="them" />
      <text x="160" y="84" textAnchor="middle" fontSize="20" fontWeight="800" fill="#ffffff55">VS</text>
      <rect x="110" y="132" width="100" height="50" rx="10" fill="#14183a" stroke={BLUE} strokeWidth="3" />
      <circle cx="140" cy="157" r="12" fill={GOLD} />
      <circle cx="180" cy="157" r="12" fill={GOLD} />
      <text x="160" y="196" textAnchor="middle" fontSize="11" fill="#9db3ff">both stakes, locked by the script</text>
      <path d="M78 108 L124 138" stroke={LIME} strokeWidth="2" strokeDasharray="4 4" />
      <path d="M242 108 L196 138" stroke={PINK} strokeWidth="2" strokeDasharray="4 4" />
    </svg>
  );
}

function Fight() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden>
      <rect width="320" height="200" fill="#5aa9e6" />
      <path d="M0 150 Q60 130 110 148 T200 146 T320 140 V200 H0 Z" fill="#5cb334" />
      <path d="M0 165 Q60 150 110 162 T200 160 T320 156 V200 H0 Z" fill="#8a5530" />
      <rect x="150" y="96" width="20" height="56" fill="#a8a196" />
      <rect x="40" y="134" width="30" height="12" rx="3" fill="#2d3a22" />
      <rect x="250" y="130" width="30" height="12" rx="3" fill="#2d3a22" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => {
        const t = i / 10;
        const x = 66 + t * 184;
        const y = 132 - Math.sin(t * Math.PI) * 96;
        return <circle key={i} cx={x} cy={y} r="3.5" fill="#ffffff" stroke="#14141a" strokeWidth="1.5" />;
      })}
      <text x="160" y="22" textAnchor="middle" fontSize="12" fontWeight="700" fill="#ffffff">one shot each, turn by turn</text>
    </svg>
  );
}

function Collect() {
  return (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden>
      <rect width="320" height="200" fill={INK} />
      <circle cx="160" cy="88" r="34" fill="#232323" stroke={LIME} strokeWidth="3" />
      <Crown x={160} y={44} size={0.7} />
      <text x="160" y="94" textAnchor="middle" fontSize="13" fontWeight="700" fill={LIME}>WINNER</text>
      <circle cx="140" cy="150" r="13" fill={GOLD} />
      <circle cx="180" cy="150" r="13" fill={GOLD} />
      <text x="160" y="188" textAnchor="middle" fontSize="14" fontWeight="700" fill={GOLD}>takes both stakes</text>
    </svg>
  );
}

export function StoryPicture({ kind, className = '' }: { kind: StoryKind; className?: string }) {
  const picture = {
    race: <Race />,
    grab: <Grab />,
    win: <Win />,
    fair: <Fair />,
    stake: <Stake />,
    fight: <Fight />,
    collect: <Collect />,
  }[kind];
  return <div className={`overflow-hidden border border-white/10 ${className}`}>{picture}</div>;
}

/** A duel in three steps, said the way you'd tell a friend. */
export const DUEL_STORY = [
  { kind: 'stake' as const, title: 'Challenge someone', body: 'Pick a player and a stake. When they accept, both stakes lock in a script that neither of you can touch.' },
  { kind: 'fight' as const, title: 'Take turns', body: 'Fire over the tower, or race the same five laps. Run out of time and your turn passes to them.' },
  { kind: 'collect' as const, title: 'Winner takes both', body: 'The chain replays the whole duel, then pays the winner both stakes. A draw gives each stake back.' },
];

/** The game in five lines, said the way you'd tell a friend. Shared by every page that explains it. */
export const STORY = [
  { kind: 'race' as const, title: 'Pay in and race', body: 'Pay the entry and drive five laps of the lane runner on your phone. Each lap’s road appears as you finish the last.' },
  { kind: 'grab' as const, title: 'Beat the best score', body: 'Beat it and you can grab the crown. Your entry goes into the prize, and the clock gets shorter.' },
  { kind: 'win' as const, title: 'Hold it at zero', body: 'Whoever holds the crown when the clock hits zero wins the whole prize.' },
  { kind: 'fair' as const, title: 'Nobody can cheat the score', body: 'The CKB chain replays your moves itself, so the score is the same for everyone.' },
];
