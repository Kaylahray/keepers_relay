/** The lane runner as players see it: the daytime highway from behind the car, with the road blocks and coins of the real game. */
export function LaneArt({ className = '', shape = 'wide' }: { className?: string; shape?: 'wide' | 'tall' }) {
  const id = shape === 'tall' ? 'lane-tall' : 'lane-wide';
  return (
    <svg
      viewBox="0 0 640 360"
      preserveAspectRatio={shape === 'tall' ? 'xMidYMax slice' : 'xMidYMid slice'}
      className={`bg-[#8cc6f0] ${className}`}
      role="img"
      aria-label="The lane runner: a car on a three-lane highway, dodging road blocks and grabbing coins"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3f8fd8" />
          <stop offset="0.7" stopColor="#a9d8f5" />
          <stop offset="1" stopColor="#fbeed2" />
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill={`url(#${id}-sky)`} />
      {/* clouds */}
      <g fill="#ffffff" opacity="0.9">
        <ellipse cx="110" cy="62" rx="44" ry="16" />
        <ellipse cx="140" cy="52" rx="30" ry="18" />
        <ellipse cx="500" cy="48" rx="50" ry="16" />
        <ellipse cx="530" cy="40" rx="28" ry="15" />
      </g>
      {/* town and hills on the horizon */}
      <path d="M0 150 Q120 120 240 146 T480 140 T640 146 V170 H0 Z" fill="#93b6c8" />
      {[40, 78, 520, 560, 600].map((x, i) => (
        <rect key={x} x={x} y={150 - 22 - (i % 3) * 14} width="26" height={30 + (i % 3) * 14} fill={['#f3d9b1', '#c9dbe8', '#e8c4c4'][i % 3]} />
      ))}
      <rect y="160" width="640" height="200" fill="#6aaa45" />
      {/* the road, narrowing to the horizon */}
      <path d="M262 160 L378 160 L560 360 L80 360 Z" fill="#45484e" />
      <path d="M262 160 L254 160 L60 360 L80 360 Z" fill="#d8d4cb" />
      <path d="M378 160 L386 160 L580 360 L560 360 Z" fill="#d8d4cb" />
      <path d="M266 162 L90 356" stroke="#ffffff" strokeWidth="3" />
      <path d="M374 162 L550 356" stroke="#ffffff" strokeWidth="3" />
      {[0, 1, 2, 3, 4].map((i) => {
        const t = 0.12 + i * 0.2;
        const y = 160 + 200 * t * t;
        const half = 6 + 26 * t;
        return (
          <g key={i} stroke="#ffffff" strokeWidth={2 + 3 * t} strokeLinecap="round">
            <path d={`M${300 - 54 * t} ${y} L${300 - 54 * t} ${y + half}`} />
            <path d={`M${340 + 54 * t} ${y} L${340 + 54 * t} ${y + half}`} />
          </g>
        );
      })}
      {/* trees along the verge */}
      {[
        [30, 230, 1.2],
        [150, 190, 0.7],
        [205, 172, 0.45],
        [470, 186, 0.7],
        [430, 172, 0.45],
        [600, 236, 1.2],
      ].map(([x, y, s]) => (
        <g key={`${x}`} transform={`translate(${x} ${y}) scale(${s})`}>
          <rect x="-4" y="0" width="8" height="18" fill="#7a5232" />
          <path d="M0 -60 L26 4 L-26 4 Z" fill="#3f7d34" />
          <path d="M0 -60 L26 4 L0 4 Z" fill="#336a2b" />
        </g>
      ))}
      {/* road blocks and coins ahead */}
      <g transform="translate(296 200)">
        <rect x="-26" y="-14" width="52" height="16" rx="2" fill="#f4f4f4" />
        {[-26, -10, 6].map((x) => (
          <path key={x} d={`M${x} 2 L${x + 8} 2 L${x + 16} -14 L${x + 8} -14 Z`} fill="#e0262f" />
        ))}
        <rect x="-27" y="-17" width="54" height="4" fill="#3a3d42" />
      </g>
      <g transform="translate(398 226)">
        <rect x="-34" y="-18" width="68" height="20" rx="2" fill="#f4f4f4" />
        {[-34, -14, 6].map((x) => (
          <path key={x} d={`M${x} 2 L${x + 10} 2 L${x + 20} -18 L${x + 10} -18 Z`} fill="#e0262f" />
        ))}
        <rect x="-35" y="-22" width="70" height="5" fill="#3a3d42" />
      </g>
      {[
        [244, 236, 9],
        [252, 212, 7],
        [258, 194, 5],
      ].map(([x, y, r]) => (
        <g key={`${x}-${y}`}>
          <ellipse cx={x} cy={y} rx={r} ry={r} fill="#ffc533" stroke="#9a7a1c" strokeWidth="1.5" />
          <ellipse cx={x - r * 0.25} cy={y - r * 0.25} rx={r * 0.35} ry={r * 0.35} fill="#fff3c0" />
        </g>
      ))}
      {/* the car, from behind */}
      <g transform="translate(320 318)">
        <ellipse cx="0" cy="30" rx="70" ry="10" fill="#000" opacity="0.3" />
        <rect x="-62" y="-4" width="124" height="32" rx="12" fill="#1f4fd1" />
        <path d="M-44 -4 L-30 -34 L30 -34 L44 -4 Z" fill="#1a43b3" />
        <path d="M-34 -8 L-24 -28 L24 -28 L34 -8 Z" fill="#7fd3ff" opacity="0.85" />
        <rect x="-56" y="6" width="22" height="7" rx="3" fill="#ff4b5c" />
        <rect x="34" y="6" width="22" height="7" rx="3" fill="#ff4b5c" />
        <rect x="-18" y="14" width="36" height="9" rx="2" fill="#f4f4f4" />
        <rect x="-60" y="24" width="20" height="14" rx="4" fill="#111" />
        <rect x="40" y="24" width="20" height="14" rx="4" fill="#111" />
      </g>
    </svg>
  );
}
