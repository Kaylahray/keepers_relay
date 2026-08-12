/** Original neo-brutalist posters — no stock photos. Deterministic from a seed. */

export const POSTER_PALETTES: readonly (readonly [string, string, string, string])[] = [
  ['#d6ff00', '#224cff', '#ff4cbd', '#ffe454'],
  ['#ff4cbd', '#101010', '#d6ff00', '#fff8e7'],
  ['#224cff', '#ffe454', '#ff4cbd', '#d6ff00'],
  ['#ffe454', '#ff4cbd', '#224cff', '#101010'],
  ['#fff8e7', '#224cff', '#d6ff00', '#ff4cbd'],
  ['#101010', '#d6ff00', '#ff4cbd', '#ffe454'],
];

export const COVER_PRESETS: { id: string; label: string }[] = [
  { id: 'lime-cell', label: 'Lime Cell' },
  { id: 'pink-pulse', label: 'Pink Pulse' },
  { id: 'cobalt-mark', label: 'Cobalt Mark' },
  { id: 'sun-window', label: 'Sun Window' },
  { id: 'cream-relay', label: 'Cream Relay' },
  { id: 'ink-streak', label: 'Ink Streak' },
];

export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function posterInitials(seed: string): string {
  const parts = seed.trim().split(/[\s_-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  const compact = seed.replace(/[^a-zA-Z0-9]/g, '');
  return (compact.slice(0, 2) || 'KR').toUpperCase();
}

export function posterDataUri(seed: string): string {
  const h = hashSeed(seed || 'keepers');
  const pal = POSTER_PALETTES[h % POSTER_PALETTES.length]!;
  const [a, b, c, d] = pal;
  const initials = posterInitials(seed || 'KR');
  const r1 = 40 + (h % 80);
  const r2 = 70 + ((h >> 5) % 90);
  const x = 80 + ((h >> 9) % 420);
  const y = 40 + ((h >> 14) % 240);
  const rot = (h >> 3) % 28;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="640" height="400">
<rect width="640" height="400" fill="${a}"/>
<rect x="24" y="24" width="592" height="352" fill="none" stroke="#101010" stroke-width="12"/>
<circle cx="${x}" cy="${y}" r="${r1}" fill="${b}"/>
<circle cx="${640 - x}" cy="${400 - y}" r="${r2}" fill="${c}"/>
<rect x="380" y="60" width="180" height="180" fill="${d}" transform="rotate(${rot} 470 150)"/>
<polygon points="40,320 180,140 280,340" fill="${b}"/>
<rect x="40" y="40" width="120" height="36" fill="#101010"/>
<text x="52" y="65" font-family="Arial Black, sans-serif" font-size="16" fill="#d6ff00">CELL</text>
<text x="320" y="230" text-anchor="middle" font-family="Arial Black, sans-serif" font-size="96" fill="#101010">${initials}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const MAX_COVER_CHARS = 350_000;

export function isUsableCover(raw: string | undefined | null): boolean {
  const v = raw?.trim() ?? '';
  if (!v || v.length > MAX_COVER_CHARS) return false;
  if (v.includes('unsplash.com') || v.includes('magicpatterns.com')) return false;
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
  return isUsableCover(coverImageUrl) ? coverImageUrl!.trim() : posterDataUri(seed);
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
