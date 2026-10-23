/** Curated arena covers — select, never generate. */

export const ARENA_COVERS: { id: string; label: string; src: string }[] = [
  { id: 'blitz', label: 'Blitz', src: '/arena/kind-blitz.png' },
  { id: 'quest', label: 'Quest', src: '/arena/kind-quest.png' },
  { id: 'archive', label: 'Archive', src: '/arena/kind-archive.png' },
  { id: 'razzael', label: 'Keeper', src: '/arena/keeper-razzael.png' },
  { id: 'featured', label: 'Featured', src: '/arena/featured-hero.png' },
];

export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic arena cover from a seed — never a generated poster. */
export function arenaCoverForSeed(seed: string): string {
  const i = hashSeed(seed || 'keepers') % ARENA_COVERS.length;
  return ARENA_COVERS[i]!.src;
}

