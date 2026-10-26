/** Crown covers: stills from the 3D night drive, one per colour (rendered from lib/game/night-drive.ts). */

export const ARENA_COVERS: { id: string; label: string; src: string }[] = [
  { id: 'lime', label: 'Lime', src: '/arena/road-lime.jpg' },
  { id: 'magenta', label: 'Magenta', src: '/arena/road-magenta.jpg' },
  { id: 'gold', label: 'Gold', src: '/arena/road-gold.jpg' },
  { id: 'blue', label: 'Blue', src: '/arena/road-blue.jpg' },
  { id: 'violet', label: 'Violet', src: '/arena/road-violet.jpg' },
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

