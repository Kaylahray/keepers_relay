import { ccc } from '@ckb-ccc/core';
import { ckbfsType, ckbfsConfigured, REGISTRY_FEE_RATE } from '@/lib/registry/config';
import { ckbfsContent, ckbfsWitness, publishData } from '@/lib/ckbfs/codec';
import { bytesToHex, hexToBytes, merkleRoot, type BankQuestion } from '@/lib/sudden-death/codec';

/**
 * Publishing the answer key, permanently, after a match is over.
 *
 * While a match runs, the bank is a secret the host commits to: only its Merkle root is on chain,
 * and a win is proved against that root without revealing anything. That is what makes the game
 * playable. It is also the last place our server still matters — it holds the key and hands out
 * proofs, so it could in principle stall one player and not another.
 *
 * A reveal closes that. Once the bank is on CKBFS, anyone can recompute the root for themselves,
 * check it against the root sealed into the match cell when it opened, and confirm the host asked
 * the questions they committed to. The host cannot take it back: CKBFS has no delete.
 */

const SHANNONS_PER_CKB = 100_000_000n;

export type RevealedQuestion = {
  index: number;
  tag: string;
  text: string;
  options: [string, string, string, string];
  correct: 0 | 1 | 2 | 3;
  /** Hex, no 0x. The salt is what makes the committed leaf unguessable before the reveal. */
  salt: string;
};

export type RevealedBank = {
  format: 'crowns-reveal/1';
  /** The match type id these questions were committed under. */
  matchId: string;
  /** The root as it appears in the match cell. Recompute it and compare. */
  root: string;
  title: string;
  revealedAt: number;
  questions: RevealedQuestion[];
};

function saltHex(salt: Uint8Array): string {
  return [...salt].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function saltBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function buildRevealedBank(input: {
  matchId: string;
  title: string;
  questions: BankQuestion[];
}): RevealedBank {
  const matchId = hexToBytes(input.matchId);
  return {
    format: 'crowns-reveal/1',
    matchId: input.matchId,
    root: bytesToHex(merkleRoot(matchId, input.questions)),
    title: input.title,
    revealedAt: Date.now(),
    questions: input.questions.map((question, index) => ({
      index,
      tag: question.tag,
      text: question.text,
      options: question.options,
      correct: question.correct,
      salt: saltHex(question.salt),
    })),
  };
}

/**
 * Check a revealed bank against the root the chain already holds.
 *
 * This is the whole point of a reveal, and it needs nothing but the published bytes and the match
 * cell: rebuild every leaf from the revealed text, salt and answer, walk them to a root, and see
 * whether it is the root the host sealed before anyone had played a round.
 */
export function revealMatchesRoot(revealed: RevealedBank, committedRoot: string): boolean {
  try {
    const questions = revealed.questions
      .slice()
      .sort((left, right) => left.index - right.index)
      .map((question) => ({
        skin: 'quiz' as const,
        tag: question.tag,
        text: question.text,
        options: question.options,
        correct: question.correct,
        salt: saltBytes(question.salt),
      }));
    const root = merkleRoot(hexToBytes(revealed.matchId), questions);
    return bytesToHex(root).toLowerCase() === committedRoot.trim().toLowerCase();
  } catch {
    return false;
  }
}

export function encodeReveal(revealed: RevealedBank): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(revealed, null, 2));
}

export function decodeReveal(content: Uint8Array): RevealedBank | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(content)) as RevealedBank;
    return parsed.format === 'crowns-reveal/1' && Array.isArray(parsed.questions) ? parsed : null;
  } catch {
    return null;
  }
}

/** Read a reveal back out of the transaction that published it. */
export function revealFromTx(tx: ccc.Transaction, witnessIndex: number): RevealedBank | null {
  const witness = tx.witnesses[witnessIndex];
  if (!witness) return null;
  const content = ckbfsContent(new Uint8Array(ccc.bytesFrom(witness)));
  return content ? decodeReveal(content) : null;
}

export class RevealError extends Error {}

/**
 * Publish a finished match's bank to CKBFS.
 *
 * The host signs this one, and it is the only transaction in the game whose point is to give
 * something away.
 */
export async function publishReveal(
  signer: ccc.Signer,
  revealed: RevealedBank,
): Promise<{ txHash: string; witnessIndex: number }> {
  if (!ckbfsConfigured()) {
    throw new RevealError(
      'CKBFS is not deployed for this build. Set NEXT_PUBLIC_CKBFS_* once the type script is on chain.',
    );
  }

  const content = encodeReveal(revealed);
  const lock = (await signer.getRecommendedAddressObj()).script;

  // The witness index is fixed up after funding: `completeInputsByCapacity` adds inputs, and
  // each input needs its own witness slot ahead of ours.
  const placeholderType = ccc.Script.from({
    codeHash: ckbfsType.codeHash,
    hashType: ckbfsType.hashType,
    args: ccc.hexFrom(new Uint8Array(32)),
  });

  const tx = ccc.Transaction.from({
    outputs: [ccc.CellOutput.from({ capacity: 0n, lock, type: placeholderType })],
    outputsData: [publishData({ witnessIndex: 0, contentType: 'application/json', filename: revealFilename(revealed), content })],
    cellDeps: [
      ccc.CellDep.from({
        outPoint: { txHash: ckbfsType.outPoint.txHash, index: ckbfsType.outPoint.index },
        depType: ckbfsType.depType,
      }),
    ],
  });

  await tx.completeInputsByCapacity(signer);
  if (!tx.inputs[0]) throw new RevealError('No input was available to anchor the type id.');

  // A CKBFS cell is identified by a type id derived from the first input, exactly like the
  // match cell is.
  const typeId = ccc.hashTypeId(tx.inputs[0], 0);
  tx.outputs[0]!.type = ccc.Script.from({
    codeHash: ckbfsType.codeHash,
    hashType: ckbfsType.hashType,
    args: typeId,
  });

  const witnessIndex = tx.inputs.length;
  tx.outputsData[0] = publishData({
    witnessIndex,
    contentType: 'application/json',
    filename: revealFilename(revealed),
    content,
  });
  while (tx.witnesses.length < witnessIndex) tx.witnesses.push('0x');
  tx.witnesses[witnessIndex] = ccc.hexFrom(ckbfsWitness(content));

  // Capacity has to cover the cell itself; the witness is transaction weight, not cell data.
  const occupied = BigInt(tx.outputs[0]!.occupiedSize) + BigInt(ccc.bytesFrom(tx.outputsData[0]!).length);
  tx.outputs[0]!.capacity = occupied * SHANNONS_PER_CKB;

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, REGISTRY_FEE_RATE);
  const txHash = await signer.sendTransaction(await signer.prepareTransaction(tx));
  return { txHash, witnessIndex };
}

function revealFilename(revealed: RevealedBank): string {
  const slug = revealed.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'crown';
  return `${slug}-reveal.json`;
}
