/** The Crowns pictures (public/crowns): the hero, each map, each item, and the scenes the pages use. */

const at = (name: string) => `/crowns/${name}.jpg`;

export const IMG = {
  hero: at('hero'),
  stepEntry: at('step-entry'),
  stepRace: at('step-race'),
  stepPayout: at('step-payout'),
  trophy: at('trophy'),
  grid: at('grid'),
  itemsScene: at('items-scene'),
  garage: at('garage'),
  refund: at('refund'),
  notFound: at('not-found'),
  chainLanding: at('chain-landing'),
};

/** One picture per map, by map id (0 Harbour Loop, 1 Switchback Hill, 2 Old Town). */
export const MAP_IMG = [at('harbour'), at('switchback'), at('old-town')];

/** Each map's accent: its line under the name and the jewel on its trophy. */
export const MAP_ACCENT = ['bg-lime', 'bg-pink', 'bg-gold'];

/** Pictures for the items that have one, by item id as lib/rally/rules numbers them (1 Ram, 2 Slick, 3 Jolt, 4 Barricade, 5 Crown Rush). */
export const ITEM_IMG: Record<number, string> = {
  1: at('ram'),
  2: at('slick'),
  3: at('jolt'),
  4: at('barricade'),
  5: at('rush'),
};

/** Ready-made driver faces, for players without a profile picture. */
export const FACES = ['nova', 'pinkvisor', 'foxtrot', 'teal', 'bot', 'tiger', 'crown', 'ghost'].map((name) => at(`avatar-${name}`));
