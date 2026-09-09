/** Curated arena covers — select, never generate. */

export const ARENA_COVERS: { id: string; label: string; src: string }[] = [
  { id: 'blitz', label: 'Blitz', src: '/arena/kind-blitz.png' },
  { id: 'quest', label: 'Quest', src: '/arena/kind-quest.png' },
  { id: 'archive', label: 'Archive', src: '/arena/kind-archive.png' },
  { id: 'razzael', label: 'Keeper', src: '/arena/keeper-razzael.png' },
  { id: 'featured', label: 'Featured', src: '/arena/featured-hero.png' },
];

/** @deprecated Use ARENA_COVERS — kept so old data URIs still resolve. */
export const COVER_PRESETS = ARENA_COVERS.map((c) => ({ id: c.id, label: c.label }));

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

const MAX_COVER_CHARS = 350_000;

export function isUsableCover(raw: string | undefined | null): boolean {
  const v = raw?.trim() ?? '';
  if (!v || v.length > MAX_COVER_CHARS) return false;
  if (v.includes('unsplash.com') || v.includes('magicpatterns.com')) return false;
  if (v.startsWith('/arena/')) return true;
  if (v.startsWith('data:image/')) return true;
  try {
    const url = new URL(v);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function resolveCover(
  coverImageUrl: string | undefined | null,
  seed: string,
): string {
  return isUsableCover(coverImageUrl) ? coverImageUrl!.trim() : arenaCoverForSeed(seed);
}

/** @deprecated Prefer arenaCoverForSeed — no generated SVGs in the UI. */
export function posterDataUri(seed: string): string {
  return arenaCoverForSeed(seed);
}

export async function fileToCoverDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Pick an image file (jpg, png, webp, gif).');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Keep the cover under 8MB.');
  }
  const bitmap = await createImageBitmap(file);
  const max = 720;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read that image.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.78);
}
