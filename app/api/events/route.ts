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
import { readBody, respond, respondWrite } from '@/lib/server/respond';
import type {
  EventMode,
  EventStatus,
  HostQuestionDraft,
  QuestionDifficulty,
  QuestionSource,
  QuestionType,
} from '@/types/event';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const url = new URL(request.url);
  const eventId = url.searchParams.get('id');
  const view = url.searchParams.get('view');
  const status = url.searchParams.get('status') as EventStatus | null;

  if (view === 'leaderboard') {
    return respond(() => getLeaderboard());
  }
  if (eventId && view === 'results') {
    return respond(() => getEventResults(eventId));
  }
  if (eventId) {
    return respond(() => getEvent(eventId));
  }
  return respond(() => listEvents(status ? { status } : undefined));
}

export async function POST(request: Request) {
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

  if (action === 'join') {
    return respondWrite(() =>
      joinEvent({
        eventId: body.eventId ?? '',
        address: body.address ?? '',
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
        address: body.address ?? '',
      }),
    );
  }

  if (action === 'answer') {
    return respondWrite(() =>
      submitAnswer({
        eventId: body.eventId ?? '',
        address: body.address ?? '',
        selectedIndex: body.selectedIndex ?? -1,
      }),
    );
  }

  if (action === 'timeout') {
    return respondWrite(() =>
      timeoutTurn({
        eventId: body.eventId ?? '',
        address: body.address,
      }),
    );
  }

  if (action === 'sponsor') {
    return respondWrite(() =>
      sponsorEvent({
        eventId: body.eventId ?? '',
        name: body.sponsorName ?? 'Sponsor',
        amount: body.amount ?? 0,
        note: body.note,
      }),
    );
  }

  if (action === 'question') {
    return respondWrite(() =>
      getQuestionForHolder({
        eventId: body.eventId ?? '',
        address: body.address ?? '',
      }),
    );
  }

  if (action === 'generate_questions') {
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
      address: body.address ?? '',
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
}
