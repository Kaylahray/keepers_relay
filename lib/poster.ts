/** Crown covers: our own drawings, a crown over the lane road, one per colour. */

export const ARENA_COVERS: { id: string; label: string; src: string }[] = [
  { id: 'lime', label: 'Lime', src: '/arena/cover-lime.svg' },
  { id: 'magenta', label: 'Magenta', src: '/arena/cover-magenta.svg' },
  { id: 'gold', label: 'Gold', src: '/arena/cover-gold.svg' },
  { id: 'blue', label: 'Blue', src: '/arena/cover-blue.svg' },
  { id: 'violet', label: 'Violet', src: '/arena/cover-violet.svg' },
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

