const SKIN = ['#f6d3b8', '#eab792', '#cf9468', '#a96d43', '#7a4a2b', '#5a3420'];
const HAIR = ['#24170f', '#4b2e1a', '#8a4b22', '#d9b25f', '#121212', '#b23a2a', '#e8e1d6'];
const MOUTHS = ['M24 44 Q32 51 40 44', 'M25 45 Q32 49 39 45', 'M26 44 Q32 50 38 44 Z', 'M27 46 L37 46'];

/** A small stable number from a name, so the same player always gets the same face. */
function hashOf(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

function hairPath(style: number): string | null {
  switch (style) {
    case 0: // short crop
      return 'M15 30 Q14 12 32 11 Q50 12 49 30 Q46 20 32 19 Q19 20 15 30 Z';
    case 1: // spikes
      return 'M14 30 L17 14 L23 20 L27 9 L32 18 L37 8 L41 19 L47 13 L50 30 Q45 21 32 20 Q19 21 14 30 Z';
    case 2: // long, falling past the ears
      return 'M13 46 Q9 14 32 11 Q55 14 51 46 L46 46 Q48 24 32 21 Q16 24 18 46 Z';
    case 3: // top bun
      return 'M15 29 Q15 14 32 13 Q49 14 49 29 Q45 20 32 20 Q19 20 15 29 Z M26 9 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0';
    default: // bald
      return null;
  }
}

/** A player's face: a cartoon portrait drawn from their name, framed in their side's colour. */
export function Avatar({ name, tone, size = 36, src = null }: { name: string; tone: string; size?: number; src?: string | null }) {
  // A player's own profile picture when they have one; otherwise the drawn face below.
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-[22%] object-cover"
        style={{ width: size, height: size, border: `2px solid ${tone}`, background: `${tone}26` }}
      />
    );
  }
  const h = hashOf(name.replace('@', '').toLowerCase() || '?');
  const skin = SKIN[h % SKIN.length]!;
  const hair = HAIR[(h >>> 4) % HAIR.length]!;
  const style = (h >>> 8) % 5;
  const mouth = MOUTHS[(h >>> 12) % MOUTHS.length]!;
  const glasses = (h >>> 16) % 5 === 0;
  const hairShape = hairPath(style);
  const id = `face-${h.toString(36)}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className="shrink-0 rounded-[22%]"
      style={{ border: `2px solid ${tone}`, background: `${tone}26` }}
      role="img"
      aria-label={name}
    >
      <defs>
        <radialGradient id={id} cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* shoulders */}
      <path d="M8 64 Q10 50 32 49 Q54 50 56 64 Z" fill={tone} opacity="0.9" />
      {/* neck, ears, head */}
      <rect x="27" y="40" width="10" height="11" rx="3" fill={skin} />
      <circle cx="15" cy="33" r="4" fill={skin} />
      <circle cx="49" cy="33" r="4" fill={skin} />
      <ellipse cx="32" cy="31" rx="17" ry="19" fill={skin} />
      <ellipse cx="32" cy="31" rx="17" ry="19" fill={`url(#${id})`} />
      {hairShape ? <path d={hairShape} fill={hair} /> : null}
      {/* brows and eyes */}
      <path d="M21 26 Q25 23.5 28 25.5 M36 25.5 Q39 23.5 43 26" stroke={style === 4 ? '#3a2a20' : hair} strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="25" cy="32" rx="2.6" ry="3.2" fill="#1b1410" />
      <ellipse cx="39" cy="32" rx="2.6" ry="3.2" fill="#1b1410" />
      <circle cx="25.9" cy="31" r="0.9" fill="#fff" />
      <circle cx="39.9" cy="31" r="0.9" fill="#fff" />
      {glasses ? (
        <g stroke="#1b1410" strokeWidth="1.6" fill="none">
          <circle cx="25" cy="32" r="5.5" />
          <circle cx="39" cy="32" r="5.5" />
          <path d="M30.5 32 L33.5 32" />
        </g>
      ) : null}
      {/* cheeks, nose, mouth */}
      <circle cx="20" cy="39" r="2.6" fill="#ff7a7a" opacity="0.25" />
      <circle cx="44" cy="39" r="2.6" fill="#ff7a7a" opacity="0.25" />
      <path d="M32 34 Q30.5 38 32.5 38.5" stroke="#00000033" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path
        d={mouth}
        stroke="#5a1f1f"
        strokeWidth="2"
        fill={mouth.endsWith('Z') ? '#8c2f2f' : 'none'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
