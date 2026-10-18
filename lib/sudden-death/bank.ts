import { randomSalt, shrunkDeadline, type BankQuestion, type QuestionBank } from './codec';

const STORAGE_KEY = 'sudden-death-bank';

function saltFromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function question(
  skin: BankQuestion['skin'],
  tag: string,
  text: string,
  options: [string, string, string, string],
  correct: BankQuestion['correct'],
  saltHex: string,
): BankQuestion {
  return { skin, tag, text, options, correct, salt: saltFromHex(saltHex) };
}

/** Built-in bank. Salts are fixed so the Merkle root is stable before a host writes their own. */
export const DEFAULT_BANK: QuestionBank = {
  id: 'ckb-floor',
  title: 'CKB floor',
  feeShannons: 50n * 100_000_000n,
  // Four questions cut 10 + 5 + 5 + 2.5 minutes, so a 25-minute clock ends with roughly two
  // minutes left if every question falls. On the two-hour default the bank ran out long before
  // the clock did, and the one thing this game does that no other quiz does never happened.
  durationMs: 25 * 60 * 1000,
  questions: [
    question(
      'quiz',
      'Cell model',
      'What does a CKB Cell hold besides capacity?',
      ['Lock, type, and data', 'An Ethereum account nonce', 'Only a token balance', 'A Solidity ABI'],
      0,
      '11'.repeat(32),
    ),
    question(
      'quiz',
      'Units',
      'How many Shannons are in 1 CKB?',
      ['1,000,000', '100,000,000', '1,000,000,000', '10,000'],
      1,
      '22'.repeat(32),
    ),
    question(
      'quiz',
      'VM',
      'Which instruction set does CKB-VM execute?',
      ['EVM bytecode', 'WASM only', 'RISC-V', 'Move bytecode'],
      2,
      '33'.repeat(32),
    ),
    question(
      'quiz',
      'State',
      'Why can two players not update the same live cell in one block?',
      [
        'Gas auctions reject the second',
        'A cell can be spent only once',
        'JoyID allows one signature a minute',
        'The VM runs single-threaded off-chain',
      ],
      1,
      '44'.repeat(32),
    ),
  ],
};

const SKIN_TAG: Record<BankQuestion['skin'], string> = {
  quiz: 'Quiz',
  lyric: 'Original bar',
  place: 'Place',
  translate: 'Translate',
  chant: 'Chant',
};

export function emptyQuestion(skin: BankQuestion['skin'] = 'quiz'): BankQuestion {
  return {
    skin,
    tag: SKIN_TAG[skin],
    text: '',
    options: ['', '', '', ''],
    correct: 0,
    salt: randomSalt(),
  };
}

export function loadBank(): QuestionBank {
  if (typeof window === 'undefined') return DEFAULT_BANK;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_BANK;
  try {
    const parsed = JSON.parse(raw) as {
      id: string;
      title: string;
      feeShannons: string;
      questions: Array<Omit<BankQuestion, 'salt'> & { salt: string }>;
    };
    return {
      id: parsed.id,
      title: parsed.title,
      feeShannons: BigInt(parsed.feeShannons),
      questions: parsed.questions.map((item) => ({
        ...item,
        salt: saltFromHex(item.salt),
      })),
    };
  } catch {
    return DEFAULT_BANK;
  }
}

export function saveBank(bank: QuestionBank) {
  const payload = {
    id: bank.id,
    title: bank.title,
    feeShannons: bank.feeShannons.toString(),
    questions: bank.questions.map((item) => ({
      ...item,
      salt: [...item.salt].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
    })),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function openingWindowMs(): number {
  return 2 * 60 * 60 * 1000;
}

export function nextDeadline(currentDeadlineMs: number, round: number): number {
  return shrunkDeadline(currentDeadlineMs, round);
}
