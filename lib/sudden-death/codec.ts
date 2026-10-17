import { ccc } from '@ckb-ccc/core';

/** Match cell data. Same offsets as `sudden-death-common`. */
export const MATCH_DATA_LEN = 158;
export const MATCH_VERSION = 1;
export const BID_VERSION = 1;

const TAG_LEAF = 0x00;
const TAG_NODE = 0x01;
const PROOF_VERSION = 1;

export type EventSkin = 'quiz' | 'lyric' | 'place' | 'translate' | 'chant';

export type BankQuestion = {
  skin: EventSkin;
  tag: string;
  text: string;
  options: [string, string, string, string];
  correct: 0 | 1 | 2 | 3;
  salt: Uint8Array;
  /** Shown with the prompt. Not part of the Merkle leaf. */
  image?: string;
};

export type QuestionBank = {
  id: string;
  title: string;
  feeShannons: bigint;
  /** Host length stamped into the match. Defaults to two hours. */
  durationMs?: number;
  questions: BankQuestion[];
};

/** Time a steal removes. Round 1 cuts 10 minutes, then halves every two rounds, floor 72s. */
export function shrinkMs(round: number): number {
  const shift = Math.min(Math.floor(round / 2), 13);
  const cut = 600_000 >> shift;
  return cut < 72_000 ? 72_000 : cut;
}

export function shrunkDeadline(currentMs: number, round: number): number {
  const cut = shrinkMs(round);
  return currentMs <= cut ? 1_000 : currentMs - cut;
}

export function ckbHash(parts: Uint8Array[]): Uint8Array {
  return ccc.bytesFrom(ccc.hashCkb(...parts));
}

export function promptHash(text: string): Uint8Array {
  return ckbHash([ccc.bytesFrom(new TextEncoder().encode(text))]);
}

export function leafHash(
  matchId: Uint8Array,
  questionIndex: number,
  question: Pick<BankQuestion, 'text' | 'correct' | 'options' | 'salt'>,
): Uint8Array {
  const index = new Uint8Array(2);
  new DataView(index.buffer).setUint16(0, questionIndex, true);
  return ckbHash([
    Uint8Array.of(TAG_LEAF),
    matchId,
    index,
    promptHash(question.text),
    Uint8Array.of(question.correct, question.options.length),
    question.salt,
  ]);
}

/** Power-of-two banks only. Path length is log2(n), and the script caps it at 6. */
export function merkleRoot(matchId: Uint8Array, questions: BankQuestion[]): Uint8Array {
  if (questions.length < 2 || questions.length > 64 || (questions.length & (questions.length - 1)) !== 0) {
    throw new Error('A bank needs 2, 4, 8, 16, 32, or 64 questions.');
  }
  let level = questions.map((question, index) => leafHash(matchId, index, question));
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(ckbHash([Uint8Array.of(TAG_NODE), level[i]!, level[i + 1]!]));
    }
    level = next;
  }
  return level[0]!;
}

export function stealProof(
  matchId: Uint8Array,
  questions: BankQuestion[],
  questionIndex: number,
): Uint8Array {
  const question = questions[questionIndex];
  if (!question) throw new Error('Question index is outside the bank.');
  let level = questions.map((item, index) => leafHash(matchId, index, item));
  const siblings: Uint8Array[] = [];
  let index = questionIndex;
  while (level.length > 1) {
    siblings.push(level[index ^ 1]!);
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(ckbHash([Uint8Array.of(TAG_NODE), level[i]!, level[i + 1]!]));
    }
    level = next;
    index = Math.floor(index / 2);
  }
  const raw = new Uint8Array(70 + siblings.length * 32);
  raw[0] = PROOF_VERSION;
  new DataView(raw.buffer).setUint16(1, questionIndex, true);
  raw[3] = question.correct;
  raw[4] = question.options.length;
  raw[5] = siblings.length;
  raw.set(promptHash(question.text), 6);
  raw.set(question.salt, 38);
  siblings.forEach((sibling, levelIndex) => raw.set(sibling, 70 + levelIndex * 32));
  return raw;
}

export function randomSalt(): Uint8Array {
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  return salt;
}

export function bytesToHex(bytes: Uint8Array): string {
  return ccc.hexFrom(bytes);
}

export function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(ccc.bytesFrom(hex));
}

export type MatchCell = {
  round: number;
  deadlineMs: bigint;
  fee: bigint;
  pot: bigint;
  king: Uint8Array;
  root: Uint8Array;
  treasury: Uint8Array;
  bidCode: Uint8Array;
};

function viewOf(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

function read32(data: Uint8Array, offset: number): Uint8Array {
  return data.slice(offset, offset + 32);
}

/** 158-byte match cell. Same offsets as the match script. */
export function encodeMatchCell(cell: MatchCell): Uint8Array {
  const data = new Uint8Array(MATCH_DATA_LEN);
  const view = viewOf(data);
  data[0] = MATCH_VERSION;
  data[1] = 0;
  view.setUint32(2, cell.round, true);
  view.setBigUint64(6, cell.deadlineMs, true);
  view.setBigUint64(14, cell.fee, true);
  view.setBigUint64(22, cell.pot, true);
  data.set(cell.king, 30);
  data.set(cell.root, 62);
  data.set(cell.treasury, 94);
  data.set(cell.bidCode, 126);
  return data;
}

export function decodeMatchCell(raw: Uint8Array): MatchCell {
  if (raw.length !== MATCH_DATA_LEN) {
    throw new Error('Match cell is the wrong length.');
  }
  const view = viewOf(raw);
  return {
    round: view.getUint32(2, true),
    deadlineMs: view.getBigUint64(6, true),
    fee: view.getBigUint64(14, true),
    pot: view.getBigUint64(22, true),
    king: read32(raw, 30),
    root: read32(raw, 62),
    treasury: read32(raw, 94),
    bidCode: read32(raw, 126),
  };
}
