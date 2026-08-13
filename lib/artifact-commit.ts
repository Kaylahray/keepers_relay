import type { ArtifactKind } from '@/types/keeper';

const ZERO_ROOT =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

function hexToBytes(hex: string): Uint8Array {
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (raw.length !== 64) {
    return new Uint8Array(32);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    out[i] = Number.parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Image-led mark kinds — UI shows an upload field. */
export function isImageMarkKind(kind: ArtifactKind): boolean {
  return kind === 'view' || kind === 'meme';
}

export function normalizeArtifactRoot(hex?: string | null): string {
  const v = hex?.trim().toLowerCase();
  if (!v || v === '0x' || v.length !== 66) return ZERO_ROOT;
  return v;
}

/**
 * Chain a new mark into artifact_root:
 * SHA-256(prevRoot || kind || body || imageUrl || place)
 */
export async function computeArtifactRoot(input: {
  previousRoot?: string | null;
  kind: ArtifactKind;
  body: string;
  imageUrl?: string;
  place?: string;
}): Promise<{ root: Uint8Array; rootHex: string }> {
  const prev = hexToBytes(normalizeArtifactRoot(input.previousRoot));
  const payload = new TextEncoder().encode(
    [
      input.kind,
      input.body.trim(),
      (input.imageUrl ?? '').trim(),
      (input.place ?? '').trim(),
    ].join('\n'),
  );
  const buf = new Uint8Array(prev.length + payload.length);
  buf.set(prev, 0);
  buf.set(payload, prev.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return { root: digest, rootHex: bytesToHex(digest) };
}

export { ZERO_ROOT as ZERO_ARTIFACT_ROOT, bytesToHex as artifactRootToHex, hexToBytes as artifactRootFromHex };
