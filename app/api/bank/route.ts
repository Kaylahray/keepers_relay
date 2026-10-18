import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { ApiError } from '@/lib/server/errors';
import { requireSession } from '@/lib/server/auth';
import { readBody, respond } from '@/lib/server/respond';
import { RATE, rateLimitOrThrow } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Drafts a question bank for a host.
 *
 * This is a typing aid and nothing more. The host edits whatever comes back and then seals it,
 * and the Merkle root commits whatever the host approved — so this route sits nowhere near the
 * part of the game that decides who wins. Nothing here can make an answer correct.
 */

/** Banks must be a power of two: the Merkle path is log2(n) and the script caps it at 6. */
const BANK_SIZES = [2, 4, 8, 16, 32, 64] as const;

const DraftedBank = z.object({
  questions: z
    .array(
      z.object({
        tag: z.string().describe('Two or three words naming the sub-topic, e.g. "Cell model".'),
        text: z.string().describe('The question. One sentence, no preamble.'),
        options: z.array(z.string()).describe('Exactly four answers.'),
        correct: z.number().describe('Index 0-3 of the correct answer.'),
      }),
    )
    .describe('The drafted bank, in the order they should be asked.'),
});

const SYSTEM = `You write questions for a live, timed, multiplayer quiz where players race each other to answer first.

What makes a question work here:
- One unambiguous correct answer that an expert would not argue with.
- Three wrong options that are genuinely tempting — a near-miss, a common misconception, a plausible-sounding invention. A player who half-knows the topic should have to think.
- Short. A player is reading it against a clock, on a phone.
- No "all of the above", no "none of the above", no negations, no trick phrasing.
- Vary where the correct answer sits. Do not put it at index 0 every time.

Order the bank so the first questions are approachable and later ones are harder.`;

export async function POST(request: Request) {
  const body = await readBody<{ topic?: string; count?: number; extra?: string }>(request);
  return respond(async () => {
    requireSession(request);

    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) {
      throw new ApiError('Question drafting is not configured on this server.', 503);
    }

    // Drafting costs real money per call, so it is capped.
    rateLimitOrThrow(request, 'bank', RATE.generateQuestions.limit, RATE.generateQuestions.windowMs);

    const topic = body.topic?.trim();
    if (!topic) throw new ApiError('Give the bank a topic to write about.', 400);
    if (topic.length > 200) throw new ApiError('Keep the topic under 200 characters.', 400);

    const count = Number(body.count ?? 8);
    if (!BANK_SIZES.includes(count as (typeof BANK_SIZES)[number])) {
      throw new ApiError('A bank has to be 2, 4, 8, 16, 32, or 64 questions.', 400);
    }

    const extra = body.extra?.trim().slice(0, 400);
    const client = new Anthropic({ apiKey: key });

    const response = await client.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { format: zodOutputFormat(DraftedBank) },
      messages: [
        {
          role: 'user',
          content: [
            `Write exactly ${count} questions about: ${topic}`,
            extra ? `Also take this into account: ${extra}` : null,
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      throw new ApiError('That topic was declined. Try describing it differently.', 400);
    }

    const drafted = response.parsed_output;
    if (!drafted) throw new ApiError('The draft came back unreadable. Try again.', 502);

    // The model is told the rules; it is not trusted to have followed them. A malformed
    // question would be sealed into the Merkle root and could not be corrected afterwards.
    const questions = drafted.questions.slice(0, count).filter(
      (question) =>
        question.text.trim().length > 0 &&
        question.options.length === 4 &&
        question.options.every((option) => option.trim().length > 0) &&
        Number.isInteger(question.correct) &&
        question.correct >= 0 &&
        question.correct <= 3,
    );

    if (questions.length !== count) {
      throw new ApiError('The draft came back malformed. Try again.', 502);
    }

    return {
      questions: questions.map((question) => ({
        tag: question.tag.trim().slice(0, 40) || 'Question',
        text: question.text.trim(),
        options: question.options.map((option) => option.trim()) as [string, string, string, string],
        correct: question.correct as 0 | 1 | 2 | 3,
      })),
    };
  });
}
