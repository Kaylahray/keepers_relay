/** Relay Event Engine — domain types (mock + future CKB). */

export type EventStatus =
  | 'registration'
  | 'ready'
  | 'live'
  | 'paused'
  | 'finished'
  | 'settled';

export type EventPlayerStatus =
  | 'registered'
  | 'active'
  | 'waiting'
  | 'eliminated'
  | 'finished'
  | 'winner';

export type TurnState = 'pending' | 'answered' | 'timed_out' | 'passed';

export type EventMode =
  | 'rapid_qa'
  | 'survival'
  | 'shrinking_clock'
  | 'pot_rush'
  | 'knowledge_battle'
  | 'creative_challenge'
  | 'rescue'
  | 'chain';

/**
 * Stackable rule config for the one core competitive event.
 * Not mutually exclusive "games modes" — prize / win / time / score combine.
 */
export type EventWinCondition = 'highest_score' | 'last_standing';

export type EventPlayRules = {
  growingPot: boolean;
  winCondition: EventWinCondition;
  shrinkingClock: boolean;
  accuracySpeed: boolean;
};

export const DEFAULT_EVENT_PLAY_RULES: EventPlayRules = {
  growingPot: true,
  winCondition: 'highest_score',
  shrinkingClock: true,
  accuracySpeed: true,
};

/** Map stacked rules → stored mode label (compat + list display). */
export function modeFromPlayRules(rules: EventPlayRules): EventMode {
  if (rules.winCondition === 'last_standing') return 'survival';
  if (rules.growingPot) return 'pot_rush';
  if (rules.shrinkingClock) return 'shrinking_clock';
  if (rules.accuracySpeed) return 'knowledge_battle';
  return 'rapid_qa';
}

export function playRulesFromMode(mode: EventMode): EventPlayRules {
  if (mode === 'chain') return { ...DEFAULT_EVENT_PLAY_RULES };
  return {
    growingPot: mode === 'pot_rush',
    winCondition: mode === 'survival' ? 'last_standing' : 'highest_score',
    shrinkingClock: mode === 'shrinking_clock' || mode === 'pot_rush' || mode === 'rapid_qa',
    accuracySpeed: mode === 'knowledge_battle' || mode === 'pot_rush',
  };
}

export function summarizePlayRules(rules: EventPlayRules): string {
  const parts: string[] = [];
  if (rules.growingPot) parts.push('Growing pot');
  parts.push(rules.winCondition === 'last_standing' ? 'Last standing' : 'Highest score');
  if (rules.shrinkingClock) parts.push('Shrinking turns');
  else parts.push('Reset clock');
  if (rules.accuracySpeed) parts.push('Speed bonus');
  return parts.join(' · ');
}

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

/** Host-facing question source — AI is optional convenience, not a dependency. */
export type QuestionSource = 'ai' | 'manual';

/** MVP question shapes. Internally we can grow; UI only shows these. */
export type QuestionType = 'multiple_choice' | 'true_false';

/**
 * Draft question from host review / manual authoring.
 * Commit hash is assigned server-side on publish.
 */
export interface HostQuestionDraft {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  difficulty: QuestionDifficulty;
  explanation?: string;
}

export interface EventQuestion {
  id: string;
  /** Commitment hash — safe to expose. */
  commit: string;
  prompt: string;
  options: string[];
  category: string;
  difficulty: QuestionDifficulty;
  timeLimitSec: number;
  explanation?: string;
  /** Server-only; stripped from public payloads. */
  correctIndex?: number;
}

export interface PublicQuestion {
  id: string;
  commit: string;
  prompt: string;
  options: string[];
  category: string;
  difficulty: QuestionDifficulty;
  timeLimitSec: number;
}

export interface EventPlayer {
  id: string;
  eventId: string;
  address: string;
  displayName: string;
  stake: number;
  score: number;
  status: EventPlayerStatus;
  joinedAt: string;
  correctCount: number;
  totalAnswerMs: number;
  answers: number;
  /** Participant cell type args identity / out point after on-chain join. */
  playerCellId?: string | null;
  joinTxHash?: string | null;
  participantOutPoint?: { txHash: string; index: string } | null;
  /** True when lobby seat is recorded off-chain but CKB seat is still pending host. */
  onChainPending?: boolean;
}

export interface EventTurn {
  id: string;
  eventId: string;
  round: number;
  currentPlayerId: string;
  previousPlayerId: string | null;
  questionId: string;
  questionCommit: string;
  startedAt: string;
  deadlineAt: string;
  state: TurnState;
  selectedIndex?: number;
  correct?: boolean;
  answeredAt?: string;
}

export interface EventHistoryEntry {
  id: string;
  at: string;
  playerId: string;
  displayName: string;
  round: number;
  correct: boolean | null;
  timedOut: boolean;
  scoreDelta: number;
  answerMs?: number;
}

export interface EventSponsor {
  id: string;
  name: string;
  amount: number;
  note?: string;
  at: string;
}

export interface RelayEvent {
  id: string;
  communityId?: string | null;
  name: string;
  description: string;
  category: string;
  mode: EventMode;
  /** Stackable competitive rules (ignored when mode === chain). */
  playRules?: EventPlayRules;
  /** Host chose AI or manual for the locked question pool. */
  questionSource?: QuestionSource;
  topics: string[];
  difficulty: QuestionDifficulty;
  status: EventStatus;
  hostAddress: string;
  hostName: string;
  entryFee: number;
  /** Host seed at create (CKB). Not rewritten on join. */
  startingPot: number;
  /**
   * Display pot = startingPot + sum(player stakes) + sum(sponsors) + bonusPot.
   * Kept in sync by the mock store — not a single mutable pot cell.
   */
  pot: number;
  /** Mode bonuses (e.g. Pot Rush correct-answer bumps). */
  bonusPot: number;
  minPlayers: number;
  maxPlayers: number;
  turnSecs: number;
  winnersCount: number;
  startAt: string;
  endAt?: string | null;
  createdAt: string;
  coverImageUrl?: string | null;
  allowSponsorship: boolean;
  sponsors: EventSponsor[];
  players: EventPlayer[];
  turns: EventTurn[];
  history: EventHistoryEntry[];
  questionPool: EventQuestion[];
  currentTurnId: string | null;
  /** Soft link to legacy Living Cell when mode === 'chain'. */
  chainJourneyId?: string | null;
  /** On-chain Event type-id (32-byte hex). */
  eventCellId?: string | null;
  createTxHash?: string | null;
  eventOutPoint?: { txHash: string; index: string } | null;
  treasuryOutPoint?: { txHash: string; index: string } | null;
  /** Last join/update that moved Event+Treasury cells. */
  lastTxHash?: string | null;
}

export interface EventSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  mode: EventMode;
  status: EventStatus;
  entryFee: number;
  pot: number;
  playerCount: number;
  minPlayers: number;
  maxPlayers: number;
  startAt: string;
  hostName: string;
  hostAddress: string;
  communityId?: string | null;
  coverImageUrl?: string | null;
  sponsorName?: string | null;
  topics: string[];
  eventCellId?: string | null;
  createTxHash?: string | null;
  eventOutPoint?: { txHash: string; index: string } | null;
  treasuryOutPoint?: { txHash: string; index: string } | null;
}

export interface EventResults {
  event: EventSummary;
  rankings: Array<{
    playerId: string;
    displayName: string;
    score: number;
    correctCount: number;
    avgMs: number;
    status: EventPlayerStatus;
    place: number;
    payout: number;
  }>;
  lineage: Array<{ displayName: string; round: number; correct: boolean | null }>;
  history: EventHistoryEntry[];
}

export const EVENT_MODE_LABEL: Record<EventMode, string> = {
  rapid_qa: 'Highest Score',
  survival: 'Last Standing',
  shrinking_clock: 'Shrinking Clock',
  pot_rush: 'Growing Pot',
  knowledge_battle: 'Accuracy + Speed',
  creative_challenge: 'Creative Challenge',
  rescue: 'Rescue',
  chain: 'Chain / Archive',
};

export function toEventSummary(event: RelayEvent): EventSummary {
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    category: event.category,
    mode: event.mode,
    status: event.status,
    entryFee: event.entryFee,
    pot: event.pot,
    playerCount: event.players.length,
    minPlayers: event.minPlayers,
    maxPlayers: event.maxPlayers,
    startAt: event.startAt,
    hostName: event.hostName,
    hostAddress: event.hostAddress,
    communityId: event.communityId ?? null,
    coverImageUrl: event.coverImageUrl,
    sponsorName: event.sponsors[0]?.name ?? null,
    topics: event.topics,
    eventCellId: event.eventCellId ?? null,
    createTxHash: event.createTxHash ?? null,
    eventOutPoint: event.eventOutPoint ?? null,
    treasuryOutPoint: event.treasuryOutPoint ?? null,
  };
}

export function toPublicQuestion(q: EventQuestion): PublicQuestion {
  return {
    id: q.id,
    commit: q.commit,
    prompt: q.prompt,
    options: q.options,
    category: q.category,
    difficulty: q.difficulty,
    timeLimitSec: q.timeLimitSec,
  };
}

/** UI lineage for Cell Timeline demo (Phase 1 mock / later indexer). */
export type CellTimelineKind =
  | 'create'
  | 'join'
  | 'sponsor'
  | 'start'
  | 'turn'
  | 'settle';

export type CellTimelineItem = {
  id: string;
  at: string;
  kind: CellTimelineKind;
  label: string;
  detail?: string;
};

export function buildCellTimeline(input: {
  eventId: string;
  createdAt: string;
  hostName: string;
  status: EventStatus;
  endAt?: string | null;
  players: EventPlayer[];
  sponsors: EventSponsor[];
  history: EventHistoryEntry[];
}): CellTimelineItem[] {
  const items: CellTimelineItem[] = [
    {
      id: `tl_create_${input.eventId}`,
      at: input.createdAt,
      kind: 'create',
      label: 'Event created',
      detail: input.hostName,
    },
  ];

  for (const p of input.players) {
    items.push({
      id: `tl_join_${p.id}`,
      at: p.joinedAt,
      kind: 'join',
      label: `${p.displayName} joined`,
      detail: `${p.stake} CKB stake`,
    });
  }

  for (const s of input.sponsors) {
    items.push({
      id: `tl_sp_${s.id}`,
      at: s.at,
      kind: 'sponsor',
      label: `${s.name} sponsored`,
      detail: `+${s.amount} CKB`,
    });
  }

  if (input.history.length > 0) {
    const first = input.history[0]!;
    items.push({
      id: `tl_start_${input.eventId}`,
      at: first.at,
      kind: 'start',
      label: 'Game started',
      detail: 'Turn Cell live',
    });
  }

  for (const h of input.history) {
    const outcome = h.timedOut
      ? 'timeout'
      : h.correct === null
        ? 'pass'
        : h.correct
          ? 'correct'
          : 'miss';
    items.push({
      id: h.id,
      at: h.at,
      kind: 'turn',
      label: `${h.displayName} → pass`,
      detail: `R${h.round} · ${outcome}${h.scoreDelta ? ` · +${h.scoreDelta} pts` : ''}`,
    });
  }

  if (
    (input.status === 'finished' || input.status === 'settled') &&
    input.endAt
  ) {
    items.push({
      id: `tl_settle_${input.eventId}`,
      at: input.endAt,
      kind: 'settle',
      label: 'Settlement',
      detail: input.status,
    });
  }

  return items.sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
}
