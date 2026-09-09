import { post, request } from '@/lib/api/client';
import type {
  EventMode,
  EventPlayer,
  EventResults,
  EventSummary,
  EventTurn,
  HostQuestionDraft,
  PublicQuestion,
  QuestionDifficulty,
  QuestionSource,
  QuestionType,
  RelayEvent,
} from '@/types/event';

export function fetchEvents(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<{ events: EventSummary[] }>(`/api/events${q}`);
}

export function fetchEvent(id: string) {
  return request<{
    event: EventSummary & {
      topics: string[];
      difficulty: QuestionDifficulty;
      hostAddress: string;
      turnSecs: number;
      winnersCount: number;
      minPlayers: number;
      allowSponsorship: boolean;
      sponsors: RelayEvent['sponsors'];
      endAt?: string | null;
      modeLabel: string;
      playRules: import('@/types/event').EventPlayRules;
      questionSource: QuestionSource;
      rulesSummary: string;
      communityName: string | null;
      communitySlug: string | null;
      startingPot: number;
      createdAt: string;
      communityId?: string | null;
      eventCellId?: string | null;
      createTxHash?: string | null;
      eventOutPoint?: { txHash: string; index: string } | null;
      treasuryOutPoint?: { txHash: string; index: string } | null;
      lastTxHash?: string | null;
    };
    players: EventPlayer[];
    currentTurn: EventTurn | null;
    history: RelayEvent['history'];
  }>(`/api/events?id=${encodeURIComponent(id)}`);
}

export function fetchEventResults(id: string) {
  return request<EventResults>(`/api/events?id=${encodeURIComponent(id)}&view=results`);
}

export function fetchEventLeaderboard() {
  return request<{
    rows: Array<{ displayName: string; wins: number; score: number; events: number }>;
  }>(`/api/events?view=leaderboard`);
}

export function createEventApi(body: {
  address: string;
  hostName: string;
  name: string;
  description: string;
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
  questionSource?: QuestionSource;
  questions?: HostQuestionDraft[];
  playRules?: import('@/types/event').EventPlayRules;
  eventCellId?: string | null;
  createTxHash?: string | null;
  eventOutPoint?: { txHash: string; index: string } | null;
  treasuryOutPoint?: { txHash: string; index: string } | null;
}) {
  return post<RelayEvent>('/api/events', { action: 'create', ...body });
}

export function generateQuestionsApi(body: {
  topics?: string[];
  difficulty?: QuestionDifficulty;
  count?: number;
  mode?: EventMode;
  turnSecs?: number;
  instructions?: string;
  questionType?: QuestionType;
}) {
  return post<{ questions: HostQuestionDraft[] }>('/api/events', {
    action: 'generate_questions',
    ...body,
  });
}

export function joinEventApi(body: {
  eventId: string;
  address: string;
  displayName: string;
  joinTxHash?: string | null;
  playerCellId?: string | null;
  participantOutPoint?: { txHash: string; index: string } | null;
  eventOutPoint?: { txHash: string; index: string } | null;
  treasuryOutPoint?: { txHash: string; index: string } | null;
  onChainPending?: boolean;
}) {
  return post<{ event: EventSummary; player: EventPlayer }>('/api/events', {
    action: 'join',
    ...body,
  });
}

export function startEventApi(body: { eventId: string; address: string }) {
  return post<{
    event: EventSummary;
    turn: EventTurn;
    question: PublicQuestion;
  }>('/api/events', { action: 'start', ...body });
}

export function answerEventApi(body: {
  eventId: string;
  address: string;
  selectedIndex: number;
}) {
  return post<{
    correct: boolean;
    explanation?: string;
    event: EventSummary;
    turn: EventTurn;
    nextTurn: EventTurn | null;
    nextQuestion: PublicQuestion | null;
    settled: boolean;
  }>('/api/events', { action: 'answer', ...body });
}

/** Anyone may call once the turn deadline has passed — server is authoritative. */
export function timeoutEventApi(body: { eventId: string; address?: string }) {
  return post<{
    timedOut: true;
    event: EventSummary;
    turn: EventTurn;
    nextTurn: EventTurn | null;
    nextQuestion: PublicQuestion | null;
    settled: boolean;
    holderName: string;
  }>('/api/events', { action: 'timeout', ...body });
}

export function sponsorEventApi(body: {
  eventId: string;
  sponsorName: string;
  amount: number;
  note?: string;
}) {
  return post<EventSummary>('/api/events', { action: 'sponsor', ...body });
}

export function fetchHolderQuestion(body: { eventId: string; address: string }) {
  return post<{
    turn: EventTurn;
    question: PublicQuestion;
    isHolder: boolean;
  }>('/api/events', { action: 'question', ...body });
}
