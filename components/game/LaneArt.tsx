/**
 * The lane runner as an illustration: a neon road with rows of blocks rolling toward the runner.
 * Pure SVG and CSS, our own palette, no image assets. Motion stops under prefers-reduced-motion.
 */
export function LaneArt({ className = '' }: { className?: string }) {
  // Rows sit at depths 0..1 (0 = horizon). Each row: which lanes are blocked, and a coin lane.
  const rows: { depth: number; blocked: number[]; coin?: number }[] = [
    { depth: 0.12, blocked: [0, 2] },
    { depth: 0.34, blocked: [1], coin: 2 },
    { depth: 0.6, blocked: [0, 1], coin: 2 },
    { depth: 0.88, blocked: [2], coin: 0 },
  ];
  const horizonY = 40;
  const baseY = 300;
  const cx = 200;
  const laneAt = (lane: number, depth: number) => cx + (lane - 1) * (40 + 90 * depth);
  const yAt = (depth: number) => horizonY + (baseY - horizonY) * depth;

  return (
    <div className={`relative overflow-hidden bg-[#0b0b12] ${className}`} aria-hidden>
      <svg viewBox="0 0 400 340" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="lane-sky" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#406aff" stopOpacity="0.55" />
            <stop offset="0.35" stopColor="#406aff" stopOpacity="0" />
          </linearGradient>
          <filter id="lane-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="400" height="340" fill="url(#lane-sky)" />
        {[-1.5, -0.5, 0.5, 1.5].map((edge) => (
          <line
            key={edge}
            x1={cx + edge * 40}
            y1={horizonY}
            x2={cx + edge * 130}
            y2={baseY + 40}
            stroke="rgba(255,255,255,0.14)"
            strokeWidth="1"
          />
        ))}
        <g className="lane-art-rows">
          {rows.map((row) => {
            const y = yAt(row.depth);
            const w = 26 + 60 * row.depth;
            const h = 4 + 14 * row.depth;
            return (
              <g key={row.depth}>
                {row.blocked.map((lane) => (
                  <g key={lane} filter="url(#lane-glow)">
                    <rect x={laneAt(lane, row.depth) - w / 2} y={y - h} width={w} height={h} fill="#ff56f6" />
                    <rect x={laneAt(lane, row.depth) - w / 2} y={y - h} width={w} height={Math.max(1, h * 0.2)} fill="#ffd1fb" />
                  </g>
                ))}
                {row.coin != null ? (
                  <circle cx={laneAt(row.coin, row.depth)} cy={y - h / 2} r={3 + 6 * row.depth} fill="#e1bf47" filter="url(#lane-glow)" />
                ) : null}
              </g>
            );
          })}
        </g>
        <polygon points={`${cx + 130},${baseY - 26} ${cx + 152},${baseY + 12} ${cx + 108},${baseY + 12}`} fill="#99ee2d" filter="url(#lane-glow)" className="lane-art-runner" />
      </svg>
      <style>{`
        .lane-art-rows { animation: lane-art-roll 2.4s linear infinite; transform-origin: 50% 12%; }
        .lane-art-runner { animation: lane-art-dodge 4.8s ease-in-out infinite; }
        @keyframes lane-art-roll { from { transform: translateY(-18px) scale(0.96); opacity: 0.85; } to { transform: translateY(14px) scale(1.04); opacity: 1; } }
        @keyframes lane-art-dodge { 0%, 30% { transform: translateX(0); } 40%, 70% { transform: translateX(-130px); } 80%, 100% { transform: translateX(0); } }
        @media (prefers-reduced-motion: reduce) { .lane-art-rows, .lane-art-runner { animation: none; } }
      `}</style>
    </div>
  );
}
