import { ccc } from '@ckb-ccc/core';

/**
 * CKBFS — witness-based content storage on CKB.
 *
 * Implemented from the protocol thread on talk.nervos.org (`ckbfs-protocol-a-standard-for-
 * witnesses-based-content-storage-system`). The content lives in a witness; the cell holds only
 * a checksum, a filename, a content type, and the backlinks that chain multi-part files together.
 *
 * Deletion is impossible by design — a CKBFS cell can be updated or transferred, never destroyed,
 * so the capacity is locked for good. For most uses that is a cost. For publishing the answer key
 * to a finished match it is the entire point: a reveal that the host could retract would prove
 * nothing.
 */

/** Witness header: the five magic bytes, then one version byte. Content follows. */
export const CKBFS_MAGIC = Uint8Array.of(0x43, 0x4b, 0x42, 0x46, 0x53); // "CKBFS"
export const CKBFS_VERSION = 0x00;
export const CKBFS_HEADER_LEN = CKBFS_MAGIC.length + 1;

const ADLER_MOD = 65521;

/**
 * Adler-32, the protocol's default checksum.
 *
 * Resumable by design: `base` carries the running value from the previous part, which is how an
 * append continues a file without rehashing what came before.
 */
export function adler32(data: Uint8Array, base = 1): number {
  let a = base & 0xffff;
  let b = (base >>> 16) & 0xffff;
  for (let i = 0; i < data.length; i += 1) {
    a = (a + data[i]!) % ADLER_MOD;
    b = (b + a) % ADLER_MOD;
  }
  return ((b << 16) | a) >>> 0;
}

export const BackLink = ccc.mol.table({
  txHash: ccc.mol.Bytes,
  index: ccc.mol.Uint32,
  checksum: ccc.mol.Uint32,
});

export const BackLinks = ccc.mol.vector(BackLink);

/** `table CKBFSData` from the spec, field order included — molecule tables are positional. */
export const CKBFSData = ccc.mol.table({
  index: ccc.mol.Uint32Opt,
  checksum: ccc.mol.Uint32,
  contentType: ccc.mol.Bytes,
  filename: ccc.mol.Bytes,
  backlinks: BackLinks,
});

export type CKBFSPublish = {
  /** Index of the witness carrying the content. Must be set on publish and append. */
  witnessIndex: number;
  contentType: string;
  filename: string;
  content: Uint8Array;
};

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** `"CKBFS" || 0x00 || content`. The checksum is taken over the content only. */
export function ckbfsWitness(content: Uint8Array): Uint8Array {
  const raw = new Uint8Array(CKBFS_HEADER_LEN + content.length);
  raw.set(CKBFS_MAGIC, 0);
  raw[CKBFS_MAGIC.length] = CKBFS_VERSION;
  raw.set(content, CKBFS_HEADER_LEN);
  return raw;
}

/** Pull the content back out of a witness, or null when it is not a CKBFS witness. */
export function ckbfsContent(witness: Uint8Array): Uint8Array | null {
  if (witness.length < CKBFS_HEADER_LEN) return null;
  for (let i = 0; i < CKBFS_MAGIC.length; i += 1) {
    if (witness[i] !== CKBFS_MAGIC[i]) return null;
  }
  if (witness[CKBFS_MAGIC.length] !== CKBFS_VERSION) return null;
  return witness.slice(CKBFS_HEADER_LEN);
}

/** Cell data for a first publish: no backlinks, checksum over this witness's content. */
export function publishData(publish: CKBFSPublish): ccc.Hex {
  return ccc.hexFrom(
    CKBFSData.encode({
      index: publish.witnessIndex,
      checksum: adler32(publish.content),
      contentType: ccc.hexFrom(utf8(publish.contentType)),
      filename: ccc.hexFrom(utf8(publish.filename)),
      backlinks: [],
    }),
  );
}

/** Does this cell's stored checksum actually match the witness content? */
export function checksumHolds(data: ccc.HexLike, content: Uint8Array, base = 1): boolean {
  try {
    return CKBFSData.decode(data).checksum === adler32(content, base);
  } catch {
    return false;
  }
}
