import { COMBO, DANGER, FORTUNE, MAGNET, OVERDRIVE, SHIELD } from '@/lib/game/crown-run';

const FRAME = 'block h-full w-full';

/** The road every picture is set on: a sky, a horizon and three lanes running away from the viewer. */
function Road({ sky, ground, edge, lane, id }: { sky: [string, string]; ground: string; edge: string; lane: string; id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
      </defs>
      <rect width="240" height="160" fill={`url(#${id}-sky)`} />
      <rect y="58" width="240" height="102" fill={ground} />
      <path d="M104 58h32l92 102H12Z" fill="#2a2c33" />
      <path d="M104 58 12 160M136 58l92 102" stroke={edge} strokeWidth="3" fill="none" />
      <path d="m114.700 58-31 102M125.300 58l31 102" stroke={lane} strokeWidth="2.500" strokeDasharray="10 9" fill="none" />
    </>
  );
}

function Car({ x = 120, y = 122, paint = '#99ee2d', scale = 1 }: { x?: number; y?: number; paint?: string; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cy="26" rx="27" ry="5" fill="#000" opacity=".4" />
      <rect x="-25" y="10" width="9" height="14" rx="2" fill="#111" />
      <rect x="16" y="10" width="9" height="14" rx="2" fill="#111" />
      <path d="M-23 8q2-20 14-24h18q12 4 14 24l2 14h-50Z" fill={paint} />
      <path d="M-14-3q1-9 7-11h14q6 2 7 11Z" fill="#15171c" />
      <rect x="-19" y="12" width="9" height="4" rx="1.500" fill="#ff5a5a" />
      <rect x="10" y="12" width="9" height="4" rx="1.500" fill="#ff5a5a" />
    </g>
  );
}

function Block({ x, y, w, h = w * 0.42 }: { x: number; y: number; w: number; h?: number }) {
  const stripe = w / 4;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="2" fill="#ff8a1f" stroke="#fff" strokeWidth="1" />
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M${x + stripe * i + stripe * 0.6} ${y}l${-stripe * 0.5} ${h}h${stripe * 0.4}l${stripe * 0.5} ${-h}Z`} fill="#fff" />
      ))}
    </g>
  );
}

function Coin({ x, y, r = 9, value }: { x: number; y: number; r?: number; value?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#e1bf47" stroke="#8d7116" strokeWidth={r * 0.18} />
      <circle cx={x} cy={y} r={r * 0.62} fill="none" stroke="#fff3c4" strokeWidth={r * 0.13} opacity=".85" />
      {value ? (
        <text x={x} y={y + r * 0.34} textAnchor="middle" fontSize={r * 0.92} fontWeight="900" fontFamily="system-ui, sans-serif" fill="#5f4a07">
          {value}
        </text>
      ) : null}
    </g>
  );
}

function ShieldArt() {
  return (
    <>
      <Road id="shield" sky={['#123a78', '#6fb4e8']} ground="#2c6a4c" edge="#dfeaff" lane="#dfeaff" />
      <Block x={84} y={70} w={72} />
      <path d="M78 104q42 34 84 0" stroke="#7fd4ff" strokeWidth="4" fill="none" opacity=".7" />
      <Car y={124} />
      <g transform="translate(120 74)">
        <path d="M0-30 28-20v22C28 18 14 28 0 34-14 28-28 18-28 2v-22Z" fill="#406aff" stroke="#d5e2ff" strokeWidth="3.500" />
        <path d="M0-20 18-13v14C18 12 9 19 0 23Z" fill="#7f9fff" />
        <path d="m-11 1 8 8 15-17" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </>
  );
}

function MagnetArt() {
  return (
    <>
      <Road id="magnet" sky={['#2b1f66', '#b06ae0']} ground="#3a3f6a" edge="#e9dcff" lane="#e9dcff" />
      <Car y={124} scale={0.9} />
      <g transform="translate(120 76)">
        <path d="M-25-26v24a25 25 0 0 0 50 0v-24H9v24a9 9 0 0 1-18 0v-24Z" fill="#ff4d5e" stroke="#fff" strokeWidth="2.500" />
        <rect x="-25" y="-34" width="16" height="11" fill="#eef1f6" stroke="#fff" strokeWidth="2" />
        <rect x="9" y="-34" width="16" height="11" fill="#eef1f6" stroke="#fff" strokeWidth="2" />
      </g>
      <Coin x={46} y={38} r={11} />
      <Coin x={194} y={38} r={11} />
      <Coin x={32} y={84} r={8} />
      <Coin x={208} y={84} r={8} />
      <path d="M58 44 86 56M182 44l-28 12M42 80l40-8M198 80l-40-8" stroke="#ffe08a" strokeWidth="2.500" strokeDasharray="5 6" strokeLinecap="round" />
    </>
  );
}

function OverdriveArt() {
  return (
    <>
      <Road id="overdrive" sky={['#29080f', '#ff7a2e']} ground="#4b2015" edge="#ffd7a3" lane="#ffd7a3" />
      <circle cx="120" cy="56" r="26" fill="#ffd166" opacity=".9" />
      <path d="M30 150 92 66M210 150 148 66M64 160l42-92M176 160l-42-92" stroke="#fff" strokeWidth="2" opacity=".55" strokeDasharray="20 11" />
      <Car y={108} paint="#99ee2d" scale={1.05} />
      <path d="M100 136q4 18-2 24 10-4 14-14 3 8 8 14 5-6 8-14 4 10 14 14-6-6-2-24Z" fill="#ff8a1f" />
      <path d="M109 136q2 10-1 17 6-3 9-10 3 7 6 10-1-8 2-17Z" fill="#ffe08a" />
      <g transform="translate(120 34)">
        <path d="M-26 8a26 26 0 0 1 52 0" stroke="#fff" strokeWidth="5" fill="none" />
        <path d="M6 8h-12L13-14Z" fill="#ff4d5e" />
      </g>
    </>
  );
}

function FortuneArt() {
  return (
    <>
      <Road id="fortune" sky={['#3f2a07', '#e8b53e']} ground="#6d5417" edge="#fff0c2" lane="#fff0c2" />
      <path d="m120 30 11 24 26 3-19 18 5 26-23-13-23 13 5-26-19-18 26-3Z" fill="#fff7d6" opacity=".22" />
      <Coin x={120} y={70} r={28} value="100" />
      <Coin x={62} y={112} r={15} />
      <Coin x={178} y={112} r={15} />
      <Coin x={84} y={136} r={18} />
      <Coin x={156} y={136} r={18} />
      <Coin x={120} y={142} r={14} />
      <path d="M46 44 54 58M40 58l14 0M194 44l-8 14M200 58h-14" stroke="#fff3c4" strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

function ComboArt() {
  return (
    <>
      <Road id="combo" sky={['#062d33', '#2fd3b9']} ground="#0f5548" edge="#d2fff2" lane="#d2fff2" />
      <Coin x={38} y={128} r={13} />
      <Coin x={78} y={108} r={15} />
      <Coin x={120} y={84} r={18} />
      <Coin x={166} y={58} r={22} />
      <path d="M50 118 66 110M92 98l13-7M136 74l12-7" stroke="#fff" strokeWidth="3.500" strokeLinecap="round" />
      <text x="38" y="108" textAnchor="middle" fontSize="13" fontWeight="900" fontFamily="system-ui, sans-serif" fill="#fff">+10</text>
      <text x="78" y="86" textAnchor="middle" fontSize="15" fontWeight="900" fontFamily="system-ui, sans-serif" fill="#fff">+20</text>
      <text x="120" y="58" textAnchor="middle" fontSize="17" fontWeight="900" fontFamily="system-ui, sans-serif" fill="#fff">+30</text>
      <path d="M204 70q16-25-4-44 2 15-9 21-4-7-1-15-18 12-8 33 5 11 22 5Z" fill="#ff8a1f" stroke="#ffe08a" strokeWidth="2" />
    </>
  );
}

/** A picture of what an upgrade does. */
export function UpgradeArt({ id, className = '' }: { id: number; className?: string }) {
  return (
    <svg viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice" className={`${FRAME} ${className}`} aria-hidden="true">
      {id === SHIELD ? <ShieldArt /> : id === MAGNET ? <MagnetArt /> : id === OVERDRIVE ? <OverdriveArt /> : id === FORTUNE ? <FortuneArt /> : id === COMBO ? <ComboArt /> : null}
    </svg>
  );
}

/** A picture of a road: calm and open, or crowded with moving blocks and coins. */
export function RoadArt({ road, className = '' }: { road: number; className?: string }) {
  const danger = road === DANGER;
  return (
    <svg viewBox="0 0 240 160" preserveAspectRatio="xMidYMid slice" className={`${FRAME} ${className}`} aria-hidden="true">
      {danger ? (
        <>
          <Road id="danger" sky={['#1b0612', '#c9253c']} ground="#3a1119" edge="#ff5a5a" lane="#ff8a1f" />
          <circle cx="120" cy="58" r="22" fill="#ff6b4a" />
          <Block x={103} y={66} w={16} />
          <Block x={121} y={66} w={16} />
          <rect x={121} y={84} width={32} height={13} rx="2" fill="#ff3b3b" opacity=".65" />
          <Block x={87} y={84} w={32} />
          <path d="m122 90 13 0m-5-5 6 5-6 5" stroke="#fff" strokeWidth="2.500" fill="none" />
          <Block x={38} y={112} w={54} />
          <Block x={148} y={112} w={54} />
          <Coin x={120} y={74} r={4} />
          <Coin x={68} y={100} r={6} />
          <Coin x={120} y={104} r={7} />
          <Car y={128} paint="#ff5a5a" scale={0.8} />
        </>
      ) : (
        <>
          <Road id="safe" sky={['#2a8bd8', '#bfe6fa']} ground="#5da63c" edge="#fff" lane="#fff" />
          <circle cx="190" cy="30" r="14" fill="#fff4b8" />
          <path d="M26 58 40 28l14 30ZM198 58l12-24 12 24ZM8 80l14-30 14 30Z" fill="#2f7d3b" />
          <Block x={82} y={78} w={24} />
          <Coin x={138} y={90} r={7} />
          <Car y={122} paint="#99ee2d" scale={0.9} />
        </>
      )}
    </svg>
  );
}
