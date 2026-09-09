import type { ArtifactKind } from '@/types/keeper';
import { nextArtifactRoot } from '@/lib/registry/chain-cell-layout';

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
 * Hash of one mark's content: SHA-256(kind || body || imageUrl || place).
 *
 * This is the preimage the Chain Cell witness carries. The contract does the
 * chaining itself — it recomputes `artifact_root` as blake2b(prevRoot || mark)
 * — so a Keeper can add to the archive but can never rewrite what came before.
 */
export async function computeMarkHash(input: {
  kind: ArtifactKind;
  body: string;
  imageUrl?: string;
  place?: string;
}): Promise<{ mark: Uint8Array; markHex: string }> {
  const payload = new TextEncoder().encode(
    [
      input.kind,
      input.body.trim(),
      (input.imageUrl ?? '').trim(),
      (input.place ?? '').trim(),
    ].join('\n'),
  );
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', payload));
  return { mark: digest, markHex: bytesToHex(digest) };
}

/**
 * The artifact root a mark will produce, mirroring the on-chain rule exactly so
 * the off-chain record and the Cell never disagree.
 */
export async function computeArtifactRoot(input: {
  previousRoot?: string | null;
  kind: ArtifactKind;
  body: string;
  imageUrl?: string;
  place?: string;
}): Promise<{ mark: Uint8Array; markHex: string; root: Uint8Array; rootHex: string }> {
  const { mark, markHex } = await computeMarkHash(input);
  const prev = hexToBytes(normalizeArtifactRoot(input.previousRoot));
  const root = nextArtifactRoot(prev, mark);
  return { mark, markHex, root, rootHex: bytesToHex(root) };
}

export { ZERO_ROOT as ZERO_ARTIFACT_ROOT, bytesToHex as artifactRootToHex, hexToBytes as artifactRootFromHex };
