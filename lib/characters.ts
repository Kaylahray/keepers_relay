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
  /** DiceBear seed — gives each cast member a unique illustrated face. */
  seed: string;
}

/**
 * Curated cast for Keepers Relay.
 * Faces come from DiceBear Adventurer (open license); we own the names + lore.
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

export function characterPortraitUrl(character: Character, size = 256): string {
  const params = new URLSearchParams({
    seed: character.seed,
    size: String(size),
    backgroundColor: character.fill.replace('#', ''),
  });
  return `https://api.dicebear.com/9.x/adventurer/svg?${params.toString()}`;
}
