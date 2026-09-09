import { createHash } from 'crypto';
import type {
  EventQuestion,
  HostQuestionDraft,
  QuestionDifficulty,
  QuestionType,
} from '@/types/event';

export type GenerateQuestionsInput = {
  topics: string[];
  difficulty: QuestionDifficulty;
  count: number;
  mode?: string;
  turnSecs?: number;
  /** Free-text host instructions (mocked until OpenAI). */
  instructions?: string;
  questionType?: QuestionType;
};

/**
 * Mock question bank — later swap for OpenAI structured outputs (server-only).
 * Never expose correctIndex outside the store/submit path.
 */
const BANK: Array<{
  topics: string[];
  prompt: string;
  options: string[];
  correctIndex: number;
  category: string;
  difficulty: QuestionDifficulty;
  explanation: string;
}> = [
  {
    topics: ['ckb', 'nervos', 'blockchain'],
    prompt: 'What does CKB stand for in Nervos?',
    options: [
      'Common Knowledge Base',
      'Crypto Key Bundle',
      'Chain Keeper Block',
      'Cell Kernel Buffer',
    ],
    correctIndex: 0,
    category: 'CKB',
    difficulty: 'easy',
    explanation: 'CKB = Common Knowledge Base — the Nervos L1.',
  },
  {
    topics: ['ckb', 'nervos', 'cell'],
    prompt: 'In the Cell model, transferring state typically means:',
    options: [
      'Mutating a row in place',
      'Consuming an old Cell and creating a new one',
      'Updating a global account balance only',
      'Writing to IPFS',
    ],
    correctIndex: 1,
    category: 'CKB',
    difficulty: 'medium',
    explanation: 'CKB is UTXO-like: spend old Cell → mint new Cell.',
  },
  {
    topics: ['ckb', 'nervos'],
    prompt: 'What unit is the native token of Nervos CKB often measured in for fees?',
    options: ['Shannon', 'Gwei', 'Lamport', 'Sat'],
    correctIndex: 0,
    category: 'CKB',
    difficulty: 'easy',
    explanation: '1 CKB = 10^8 shannons.',
  },
  {
    topics: ['anime', 'naruto'],
    prompt: 'Who is Naruto’s father?',
    options: ['Kakashi', 'Jiraiya', 'Minato Namikaze', 'Hiruzen'],
    correctIndex: 2,
    category: 'Naruto',
    difficulty: 'easy',
    explanation: 'Minato Namikaze, the Fourth Hokage.',
  },
  {
    topics: ['anime', 'bleach'],
    prompt: 'What is the name of Ichigo’s Zanpakutō in its base form?',
    options: ['Zangetsu', 'Senbonzakura', 'Ryujin Jakka', 'Tensa Zangetsu'],
    correctIndex: 0,
    category: 'Bleach',
    difficulty: 'easy',
    explanation: 'Zangetsu; Tensa Zangetsu is Bankai.',
  },
  {
    topics: ['anime', 'one piece'],
    prompt: 'What is the name of Luffy’s signature stretchy fruit (pre-reveal formal name era)?',
    options: ['Gomu Gomu no Mi', 'Mera Mera no Mi', 'Hito Hito no Mi', 'Yami Yami no Mi'],
    correctIndex: 0,
    category: 'One Piece',
    difficulty: 'easy',
    explanation: 'Gomu Gomu no Mi — Gum-Gum Fruit.',
  },
  {
    topics: ['general', 'keepers'],
    prompt: 'In Relay, the living baton that moves player to player is called a:',
    options: ['Ticket', 'Cell', 'Shard', 'Scroll'],
    correctIndex: 1,
    category: 'Relay',
    difficulty: 'easy',
    explanation: 'The Cell is the baton.',
  },
  {
    topics: ['general', 'keepers'],
    prompt: 'The core Relay primitive is best summarized as:',
    options: [
      'mint → list → trade',
      'stake → play → leave a mark → pass → settle',
      'vote → fork → merge',
      'bridge → wrap → unwrap',
    ],
    correctIndex: 1,
    category: 'Relay',
    difficulty: 'medium',
    explanation: 'Stateful event loop on CKB.',
  },
  {
    topics: ['ckb', 'nervos'],
    prompt: 'Why keep quiz question text off-chain?',
    options: [
      'CKB cannot store bytes',
      'Cost, privacy of the pool, and commit-reveal fairness',
      'Questions must be NFTs',
      'RPC forbids strings',
    ],
    correctIndex: 1,
    category: 'CKB',
    difficulty: 'hard',
    explanation: 'Store commits/hashes on-chain; content off-chain.',
  },
  {
    topics: ['anime', 'naruto', 'bleach', 'one piece'],
    prompt: 'Which series features Soul Society?',
    options: ['Naruto', 'Bleach', 'One Piece', 'Dragon Ball'],
    correctIndex: 1,
    category: 'Anime',
    difficulty: 'easy',
    explanation: 'Bleach.',
  },
];

function hashCommit(parts: string[]): string {
  return `0x${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32)}`;
}

function matchesTopic(entryTopics: string[], wanted: string[]): boolean {
  if (wanted.length === 0) return true;
  const w = wanted.map((t) => t.toLowerCase());
  return entryTopics.some((t) => w.some((x) => t.includes(x) || x.includes(t)));
}

/**
 * Generate a question pool for an event.
 * Later: call OpenAI Responses API with JSON schema; keep keys server-side.
 * Host always reviews drafts before publish — AI is convenience, not a dependency.
 */
export function generateQuestions(input: GenerateQuestionsInput): EventQuestion[] {
  const topics = input.topics.map((t) => t.trim().toLowerCase()).filter(Boolean);
  const turnSecs = input.turnSecs ?? 15;
  const count = Math.min(50, Math.max(1, input.count));
  const filtered = BANK.filter(
    (b) =>
      matchesTopic(b.topics, topics) &&
      (input.difficulty === 'hard'
        ? true
        : difficultyRank(b.difficulty) <= difficultyRank(input.difficulty) + 1),
  );
  const pool = filtered.length >= count ? filtered : [...BANK];
  const out: EventQuestion[] = [];
  for (let i = 0; i < count; i += 1) {
    const row = pool[i % pool.length]!;
    let options = [...row.options];
    let correctIndex = row.correctIndex;
    let prompt = row.prompt;
    if (input.questionType === 'true_false') {
      // Collapse bank items into T/F when host asked for that shape.
      const statement = row.prompt.replace(/\?$/, '.');
      prompt = `True or false: ${statement}`;
      options = ['True', 'False'];
      correctIndex = 0;
    }
    const id = `q_${Date.now().toString(36)}_${i}`;
    const commit = hashCommit([id, prompt, String(correctIndex), String(i)]);
    out.push({
      id,
      commit,
      prompt,
      options,
      category: row.category,
      difficulty: bumpDifficulty(row.difficulty, input.difficulty, i),
      timeLimitSec: Math.max(5, turnSecs - Math.floor(i / 3) * 2),
      explanation: row.explanation,
      correctIndex,
    });
  }
  return out;
}

/** Strip commits for host review UI. */
export function toHostDrafts(questions: EventQuestion[]): HostQuestionDraft[] {
  return questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    options: [...q.options],
    correctIndex: q.correctIndex ?? 0,
    difficulty: q.difficulty,
    explanation: q.explanation,
  }));
}

/**
 * Normalize host-authored / reviewed drafts into the vault with commits.
 */
export function commitHostQuestions(
  drafts: HostQuestionDraft[],
  input: { turnSecs?: number; category?: string },
): EventQuestion[] {
  const turnSecs = input.turnSecs ?? 15;
  if (drafts.length < 1) throw new Error('Add at least one question.');
  return drafts.map((draft, i) => {
    const prompt = draft.prompt.trim();
    if (!prompt) throw new Error(`Question ${i + 1} needs a prompt.`);
    const options = draft.options.map((o) => o.trim()).filter(Boolean);
    if (options.length < 2) throw new Error(`Question ${i + 1} needs at least 2 options.`);
    if (draft.correctIndex < 0 || draft.correctIndex >= options.length) {
      throw new Error(`Question ${i + 1} needs a valid correct answer.`);
    }
    const id = draft.id?.trim() || `q_${Date.now().toString(36)}_${i}`;
    const commit = hashCommit([id, prompt, String(draft.correctIndex), String(i)]);
    return {
      id,
      commit,
      prompt,
      options,
      category: input.category ?? 'Custom',
      difficulty: draft.difficulty,
      timeLimitSec: Math.max(5, turnSecs),
      explanation: draft.explanation?.trim() || undefined,
      correctIndex: draft.correctIndex,
    };
  });
}

function difficultyRank(d: QuestionDifficulty): number {
  return d === 'easy' ? 0 : d === 'medium' ? 1 : 2;
}

function bumpDifficulty(
  base: QuestionDifficulty,
  target: QuestionDifficulty,
  index: number,
): QuestionDifficulty {
  if (index >= 6 || target === 'hard') return 'hard';
  if (index >= 3 || target === 'medium') return base === 'easy' ? 'medium' : base;
  return base;
}

/** Seam for future OpenAI integration. */
export async function generateQuestionsAsync(
  input: GenerateQuestionsInput,
): Promise<EventQuestion[]> {
  // if (process.env.OPENAI_API_KEY) { ... structured outputs ... }
  return generateQuestions(input);
}
