import {
  createEvent,
  getEvent,
  getEventResults,
  getLeaderboard,
  joinEvent,
  listEvents,
  previewGenerateQuestions,
  sponsorEvent,
  startEvent,
  submitAnswer,
  timeoutTurn,
  getQuestionForHolder,
} from '@/lib/server/events-store';
import { ensureEventLoaded, readBody, respond, respondWrite } from '@/lib/server/respond';
import { requireSession } from '@/lib/server/auth';
import { StoreError } from '@/lib/server/errors';
import { RATE, rateLimitOrThrow } from '@/lib/server/rate-limit';
import { verifyJoinOnChain } from '@/lib/server/verify-onchain';
import type {
  EventMode,
  EventStatus,
  HostQuestionDraft,
  QuestionDifficulty,
  QuestionSource,
  QuestionType,
} from '@/types/event';

export const dynamic = 'force-dynamic';

async function getEventOrRecover(eventId: string) {
  try {
    return getEvent(eventId);
  } catch (err) {
    if (err instanceof StoreError && err.status === 404) {
      const loaded = await ensureEventLoaded(eventId);
      if (loaded) return getEvent(eventId);
    }
    throw err;
  }
}

async function getResultsOrRecover(eventId: string) {
  try {
    return getEventResults(eventId);
  } catch (err) {
    if (err instanceof StoreError && err.status === 404) {
      const loaded = await ensureEventLoaded(eventId);
      if (loaded) return getEventResults(eventId);
    }
    throw err;
  }
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const eventId = url.searchParams.get('id');
  const view = url.searchParams.get('view');
  const status = url.searchParams.get('status') as EventStatus | null;

  if (view === 'leaderboard') {
    return respond(() => getLeaderboard());
  }
  if (eventId && view === 'results') {
    return respond(() => getResultsOrRecover(eventId));
  }
  if (eventId) {
    return respond(() => getEventOrRecover(eventId));
  }
  return respond(() => listEvents(status ? { status } : undefined));
}

export async function POST(request: Request) {
  try {
    rateLimitOrThrow(
      request,
      'events:write',
      RATE.eventsWrite.limit,
      RATE.eventsWrite.windowMs,
    );

    const body = await readBody<{
      action?:
        | 'create'
        | 'join'
        | 'start'
        | 'answer'
        | 'timeout'
        | 'sponsor'
        | 'question'
        | 'generate_questions';
      address?: string;
      hostName?: string;
      displayName?: string;
      eventId?: string;
      name?: string;
      description?: string;
      category?: string;
      mode?: EventMode;
      topics?: string[];
      difficulty?: QuestionDifficulty;
      entryFee?: number;
      startingPot?: number;
      minPlayers?: number;
      maxPlayers?: number;
      turnSecs?: number;
      winnersCount?: number;
      startAt?: string;
      communityId?: string | null;
      allowSponsorship?: boolean;
      coverImageUrl?: string | null;
      selectedIndex?: number;
      sponsorName?: string;
      amount?: number;
      note?: string;
      txHash?: string | null;
      questionSource?: QuestionSource;
      questions?: HostQuestionDraft[];
      count?: number;
      instructions?: string;
      questionType?: QuestionType;
      playRules?: import('@/types/event').EventPlayRules;
      eventCellId?: string | null;
      createTxHash?: string | null;
      eventOutPoint?: { txHash: string; index: string } | null;
      treasuryOutPoint?: { txHash: string; index: string } | null;
      joinTxHash?: string | null;
      playerCellId?: string | null;
      participantOutPoint?: { txHash: string; index: string } | null;
      onChainPending?: boolean;
    }>(request);

    const action = body.action ?? 'create';

    // Public timeout (clock authority) + question preview — still need session for preview spam control
    if (action === 'timeout') {
      return respondWrite(() =>
        timeoutTurn({
          eventId: body.eventId ?? '',
          address: body.address,
        }),
      );
    }

    const session = requireSession(request, body.address);
    const address = session.address;

    if (action === 'join') {
      await verifyJoinOnChain({
        joinTxHash: body.joinTxHash,
        participantOutPoint: body.participantOutPoint,
        eventOutPoint: body.eventOutPoint,
      });
      return respondWrite(() =>
        joinEvent({
          eventId: body.eventId ?? '',
          address,
          displayName: body.displayName ?? 'Keeper',
          joinTxHash: body.joinTxHash,
          playerCellId: body.playerCellId,
          participantOutPoint: body.participantOutPoint,
          eventOutPoint: body.eventOutPoint,
          treasuryOutPoint: body.treasuryOutPoint,
          onChainPending: body.onChainPending,
        }),
      );
    }

    if (action === 'start') {
      return respondWrite(() =>
        startEvent({
          eventId: body.eventId ?? '',
          address,
        }),
      );
    }

    if (action === 'answer') {
      return respondWrite(() =>
        submitAnswer({
          eventId: body.eventId ?? '',
          address,
          selectedIndex: body.selectedIndex ?? -1,
        }),
      );
    }

    if (action === 'sponsor') {
      return respondWrite(() =>
        sponsorEvent({
          eventId: body.eventId ?? '',
          name: body.sponsorName ?? '',
          amount: body.amount ?? 0,
          note: body.note,
          txHash: body.txHash,
        }),
      );
    }

    if (action === 'question') {
      return respondWrite(() =>
        getQuestionForHolder({
          eventId: body.eventId ?? '',
          address,
        }),
      );
    }

    if (action === 'generate_questions') {
      rateLimitOrThrow(
        request,
        'events:generate_questions',
        RATE.generateQuestions.limit,
        RATE.generateQuestions.windowMs,
      );
      return respondWrite(() =>
        previewGenerateQuestions({
          topics: body.topics,
          difficulty: body.difficulty,
          count: body.count,
          mode: body.mode,
          turnSecs: body.turnSecs,
          instructions: body.instructions,
          questionType: body.questionType,
        }),
      );
    }

    return respondWrite(() =>
      createEvent({
        address,
        hostName: body.hostName ?? 'Host',
        name: body.name ?? '',
        description: body.description ?? '',
        category: body.category,
        mode: body.mode,
        topics: body.topics,
        difficulty: body.difficulty,
        entryFee: body.entryFee,
        startingPot: body.startingPot,
        minPlayers: body.minPlayers,
        maxPlayers: body.maxPlayers,
        turnSecs: body.turnSecs,
        winnersCount: body.winnersCount,
        startAt: body.startAt,
        communityId: body.communityId,
        allowSponsorship: body.allowSponsorship,
        coverImageUrl: body.coverImageUrl,
        questionSource: body.questionSource,
        questions: body.questions,
        playRules: body.playRules,
        eventCellId: body.eventCellId,
        createTxHash: body.createTxHash,
        eventOutPoint: body.eventOutPoint,
        treasuryOutPoint: body.treasuryOutPoint,
      }),
    );
  } catch (error) {
    if (error instanceof StoreError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    return Response.json({ message }, { status: 500 });
  }
}
