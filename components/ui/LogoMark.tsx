/**
 * The Crowns mark: a crown cut out of a tile that runs from Crowns lime to Duels pink, the two
 * ways to play in one badge. Pointed on the right like our buttons.
 */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="crowns-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#99ee2d" />
          <stop offset="1" stopColor="#ff56f6" />
        </linearGradient>
      </defs>
      <path d="M10 2 H48 L62 32 L48 62 H10 Q2 62 2 54 V10 Q2 2 10 2 Z" fill="url(#crowns-mark)" />
      {/* the crown: three points, a band, a gem on the middle point */}
      <path d="M13 44 L13 22 L22 31 L30 15 L38 31 L47 22 L47 44 Z" fill="#111111" />
      <rect x="13" y="47" width="34" height="6" rx="2" fill="#111111" />
      <circle cx="30" cy="12" r="3.5" fill="#111111" />
      <circle cx="13" cy="19" r="3" fill="#111111" />
      <circle cx="47" cy="19" r="3" fill="#111111" />
    </svg>
  );
}
