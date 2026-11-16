import { FACES } from '@/lib/crowns/art';

/** A small stable number from a name, so the same player always gets the same face. */
function hashOf(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A player's face, framed in their side's colour: `src` is their picture, null when they have none (a ready-made face), undefined while it is still loading. */
export function Avatar({ name, tone = '#262a31', size = 36, src }: { name: string; tone?: string; size?: number; src: string | null | undefined }) {
  // Still looking: an empty frame with a spinner, so a ready-made face never flashes before the real picture.
  if (src === undefined) {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-full"
        style={{ width: size, height: size, border: `2px solid ${tone}`, background: `${tone}26` }}
        role="img"
        aria-label={`${name}, loading picture`}
      >
        <span
          className="animate-spin rounded-full border-2 border-white/20"
          style={{ width: Math.max(10, size * 0.36), height: Math.max(10, size * 0.36), borderTopColor: tone }}
        />
      </span>
    );
  }
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size, border: `2px solid ${tone}`, background: `${tone}26` }}
      />
    );
  }
  // No picture of their own: one of the ready-made driver faces, the same one for the same name.
  const face = FACES[hashOf(name.replace('@', '').toLowerCase() || '?') % FACES.length]!;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={face}
      alt={name}
      width={size}
      height={size}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size, border: `2px solid ${tone}`, background: `${tone}26` }}
    />
  );
}
