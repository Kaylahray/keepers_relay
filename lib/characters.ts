export type CharacterId =
  | 'nova'
  | 'ember'
  | 'volt'
  | 'mira'
  | 'kai'
  | 'rune'
  | 'haze'
  | 'spark';

export interface Character {
  id: CharacterId;
  name: string;
  title: string;
  tagline: string;
  /** Neon accent used on cards and avatars. */
  accent: string;
  /** Secondary fill for posters. */
  fill: string;
  /** Stable seed used only for SVG pattern variation — not random generation. */
  seed: string;
}

/**
 * Curated cast for Keepers Relay.
 * Portraits are fixed SVG silhouettes (select, never generate).
 */
export const CHARACTERS: Character[] = [
  {
    id: 'nova',
    name: 'Nova',
    title: 'Signal Runner',
    tagline: 'First through the fog of a new idea.',
    accent: '#d6ff00',
    fill: '#224cff',
    seed: 'KeeperNova',
  },
  {
    id: 'ember',
    name: 'Ember',
    title: 'Chain Tender',
    tagline: 'Keeps the streak warm when everyone else sleeps.',
    accent: '#ff6b2d',
    fill: '#ffe454',
    seed: 'KeeperEmber',
  },
  {
    id: 'volt',
    name: 'Volt',
    title: 'Cell Breaker',
    tagline: 'Asks one hard question before every handoff.',
    accent: '#224cff',
    fill: '#d6ff00',
    seed: 'KeeperVolt',
  },
  {
    id: 'mira',
    name: 'Mira',
    title: 'Culture Scout',
    tagline: 'Collects marks worth carrying forward.',
    accent: '#ff4cbd',
    fill: '#fff8e7',
    seed: 'KeeperMira',
  },
  {
    id: 'kai',
    name: 'Kai',
    title: 'Builder Relay',
    tagline: 'Turns docs into something someone can ship.',
    accent: '#ffe454',
    fill: '#224cff',
    seed: 'KeeperKai',
  },
  {
    id: 'rune',
    name: 'Rune',
    title: 'Archive Keeper',
    tagline: 'Remembers who held the Cell and why.',
    accent: '#fff8e7',
    fill: '#101010',
    seed: 'KeeperRune',
  },
  {
    id: 'haze',
    name: 'Haze',
    title: 'Night Watch',
    tagline: 'Holds the deadline when the timer gets loud.',
    accent: '#ff4cbd',
    fill: '#224cff',
    seed: 'KeeperHaze',
  },
  {
    id: 'spark',
    name: 'Spark',
    title: 'Onboard Pilot',
    tagline: 'Pulls the next builder into the room.',
    accent: '#d6ff00',
    fill: '#ff4cbd',
    seed: 'KeeperSpark',
  },
];

export function getCharacter(id: CharacterId | string | null | undefined): Character | undefined {
  if (!id) return undefined;
  return CHARACTERS.find((character) => character.id === id);
}

const FULL_BODY_ART: Record<CharacterId, string> = {
  nova: '/arena/kind-archive.png',
  ember: '/arena/kind-quest.png',
  volt: '/arena/keeper-razzael.png',
  mira: '/arena/kind-blitz.png',
  kai: '/arena/featured-hero.png',
  rune: '/arena/kind-archive.png',
  haze: '/arena/keeper-razzael.png',
  spark: '/arena/kind-blitz.png',
};

/** Tall full-body plate for the cast line / hero stage — never a cropped headshot. */
export function characterFullBodyUrl(character: Character): string {
  return FULL_BODY_ART[character.id] ?? '/arena/keeper-razzael.png';
}

/**
 * Prefer curated local art when we have it; otherwise a fixed SVG plate.
 * Never a random face generator.
 */
export function characterPortraitUrl(character: Character, size = 256): string {
  // Small avatars still use full-body art cropped carefully via object-position in UI.
  if (FULL_BODY_ART[character.id]) {
    return FULL_BODY_ART[character.id];
  }
  const accent = character.accent;
  const fill = character.fill;
  const initial = character.name.slice(0, 1).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${fill}"/>
        <stop offset="55%" stop-color="${accent}"/>
        <stop offset="100%" stop-color="#15121d"/>
      </linearGradient>
    </defs>
    <rect width="256" height="256" fill="url(#g)"/>
    <circle cx="128" cy="108" r="36" fill="#f5f5f5" opacity="0.92"/>
    <text x="128" y="122" text-anchor="middle" font-family="system-ui,sans-serif" font-size="36" font-weight="700" fill="${fill}">${initial}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
