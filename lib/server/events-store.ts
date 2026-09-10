import { arenaCoverForSeed } from '@/lib/poster';
import {
  commitHostQuestions,
  generateQuestions,
  toHostDrafts,
} from '@/lib/questions/questionGenerationService';
import {
  canJoinEvent,
  canStartEvent,
  computeDisplayedPot,
  relayBus,
  resolveStackedRules,
  turnSecsForStackedRound,
  wireNotificationBridge,
} from '@/lib/relay';
import type {
  EventHistoryEntry,
  EventMode,
  EventPlayRules,
  EventPlayer,
  EventResults,
  EventStatus,
  EventSummary,
  EventTurn,
  HostQuestionDraft,
  PublicQuestion,
  QuestionDifficulty,
  QuestionSource,
  QuestionType,
  RelayEvent,
} from '@/types/event';
import {
  EVENT_MODE_LABEL,
  modeFromPlayRules,
  playRulesFromMode,
  summarizePlayRules,
  toEventSummary,
  toPublicQuestion,
} from '@/types/event';
import { normalizeAddress } from '@/lib/server/auth';
import {
  resolveCommunityName,
  resolveCommunitySlug,
} from '@/lib/server/community-index';
import { StoreError } from './errors';
import { persistRelayQuestionsBestEffort } from '@/lib/db/events-persist';

/**
 * Event engine application service.
 * Domain rules live in `@/lib/relay` (SDK-shaped).
 * Neon `relay_events` is the source of truth. The Map is only a per-request
 * working set loaded from the DB in `respond` / `respondWrite` — never a local store.
 */

wireNotificationBridge();

const globalEvents = globalThis as typeof globalThis & {
  __keepersRelayEventsV1?: Map<string, RelayEvent>;
  __keepersRelayEventsDirty?: boolean;
  __keepersRelayDirtyIds?: Set<string>;
  __keepersRelayFlushAll?: boolean;
};

function eventsMap(): Map<string, RelayEvent> {
  if (!globalEvents.__keepersRelayEventsV1) {
    globalEvents.__keepersRelayEventsV1 = new Map();
  }
  return globalEvents.__keepersRelayEventsV1;
}

function markEventsDirty(eventId?: string): void {
  globalEvents.__keepersRelayEventsDirty = true;
  if (!eventId) {
    globalEvents.__keepersRelayFlushAll = true;
    return;
  }
  if (!globalEvents.__keepersRelayDirtyIds) {
    globalEvents.__keepersRelayDirtyIds = new Set();
  }
  globalEvents.__keepersRelayDirtyIds.add(eventId);
}

export function consumeEventsDirty(): boolean {
  const dirty = Boolean(globalEvents.__keepersRelayEventsDirty);
  globalEvents.__keepersRelayEventsDirty = false;
  return dirty;
}

/** Ids that need Neon upsert; 'all' when demo seed / unknown. */
export function consumeDirtyEventIds(): string[] | 'all' {
  if (globalEvents.__keepersRelayFlushAll) {
    globalEvents.__keepersRelayFlushAll = false;
    globalEvents.__keepersRelayDirtyIds?.clear();
    return 'all';
  }
  const ids = [...(globalEvents.__keepersRelayDirtyIds ?? [])];
  globalEvents.__keepersRelayDirtyIds?.clear();
  return ids;
}

export function exportRelayEvents(): RelayEvent[] {
  return [...eventsMap().values()].map((e) => JSON.parse(JSON.stringify(e)) as RelayEvent);
}

/** Replace working set from Neon rows. */
export function importRelayEvents(rows: RelayEvent[]): void {
  const map = eventsMap();
  map.clear();
  for (const event of rows) {
    if (event?.id) map.set(event.id, event);
  }
}

/** Merge one row into the working set (Neon miss recovery). */
export function putRelayEvent(event: RelayEvent): void {
  if (!event?.id) return;
  eventsMap().set(event.id, event);
}

/**
 * Seed stable demos into the working set only when Neon returned zero rows.
 * Caller must persist immediately (see respond.hydrateEvents).
 */
export function ensureDemoEvents(): void {
  if (eventsMap().size > 0) return;
  seedDemoEvents();
  markEventsDirty();
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function requireEvent(eventId: string): RelayEvent {
  const event = eventsMap().get(eventId);
  if (!event) throw new StoreError('Event not found.', 404);
  return event;
}

function recomputeStatus(event: RelayEvent): void {
  if (event.status === 'finished' || event.status === 'settled' || event.status === 'live') {
    return;
  }
  // Min unlocks READY; max only caps joins (checked in joinEvent).
  if (event.players.length >= event.minPlayers) {
    event.status = 'ready';
  } else {
    event.status = 'registration';
  }
}

/** Pot = host seed + player stakes + sponsors + mode bonuses (not one mutable pot cell). */
function recomputePot(event: RelayEvent): void {
  event.pot = computeDisplayedPot({
    startingPot: event.startingPot,
    playerStakes: event.players.map((p) => p.stake),
    sponsorAmounts: event.sponsors.map((s) => s.amount),
    bonusPot: event.bonusPot,
  });
}

/**
 * Flip an event into LIVE and mint the first Turn.
 * Caller must already have checked min players / status.
 */
function beginLive(event: RelayEvent): {
  turn: EventTurn;
  question: PublicQuestion;
} {
  event.players.forEach((p) => {
    p.status = 'waiting';
  });
  const first = event.players[0]!;
  first.status = 'active';
  event.status = 'live';

  const question = event.questionPool[0];
  if (!question) throw new Error('No questions in pool.');
  const secs = turnSecsForRound(event, 1);
  const turn: EventTurn = {
    id: id('turn'),
    eventId: event.id,
    round: 1,
    currentPlayerId: first.id,
    previousPlayerId: null,
    questionId: question.id,
    questionCommit: question.commit,
    startedAt: nowIso(),
    deadlineAt: new Date(Date.now() + secs * 1000).toISOString(),
    state: 'pending',
  };
  event.turns.push(turn);
  event.currentTurnId = turn.id;
  markEventsDirty(event.id);
  void relayBus.emit('event.started', {
    eventId: event.id,
    payload: { round: 1, holderId: first.id },
  });
  void relayBus.emit('turn.created', {
    eventId: event.id,
    actorAddress: first.address,
    payload: { turnId: turn.id, round: 1 },
  });
  void relayBus.emit('turn.started', {
    eventId: event.id,
    actorAddress: first.address,
    payload: { turnId: turn.id, deadlineAt: turn.deadlineAt },
  });
  void relayBus.emit('turn.question_assigned', {
    eventId: event.id,
    actorAddress: first.address,
    payload: { questionId: question.id, commit: question.commit },
  });
  return {
    turn,
    question: toPublicQuestion({ ...question, timeLimitSec: secs }),
  };
}

/**
 * Schedule start: if min players are seated and wall clock ≥ startAt → LIVE.
 * Host can still start early via startEvent once READY.
 * Only call from join/write paths — never from list/get (F13).
 */
function maybeAutoStart(event: RelayEvent): boolean {
  if (event.status === 'live' || event.status === 'finished' || event.status === 'settled') {
    return false;
  }
  recomputeStatus(event);
  if (event.players.length < event.minPlayers) return false;
  if (Date.now() < new Date(event.startAt).getTime()) return false;
  beginLive(event);
  markEventsDirty(event.id);
  return true;
}

/** Run schedule auto-starts across the working set (write-path only). */
export function runAutoStarts(): number {
  let started = 0;
  for (const event of eventsMap().values()) {
    if (maybeAutoStart(event)) started += 1;
  }
  return started;
}

function turnSecsForRound(event: RelayEvent, round: number): number {
  const stacked = resolveStackedRules({
    mode: event.mode,
    playRules: event.playRules,
  });
  return turnSecsForStackedRound(stacked.shrinkTurnSecs, event.turnSecs, round);
}

function activePlayers(event: RelayEvent): EventPlayer[] {
  return event.players.filter(
    (p) => p.status === 'registered' || p.status === 'waiting' || p.status === 'active',
  );
}

function nextPlayerAfter(event: RelayEvent, currentId: string): EventPlayer | null {
  const alive = activePlayers(event);
  if (alive.length === 0) return null;
  const idx = alive.findIndex((p) => p.id === currentId);
  if (idx < 0) return alive[0] ?? null;
  return alive[(idx + 1) % alive.length] ?? null;
}

function seedDemoEvents(): void {
  if (eventsMap().size > 0) return;
  const start = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  createEvent({
    id: 'evt_demo_ckb_rapid_01',
    address: 'ckt1qdemo...host',
    hostName: 'Relay Desk',
    name: 'CKB Rapid Fire #01',
    description: 'Stake in. Answer on your turn. Pass the Cell. Top two split the pot.',
    category: 'Knowledge',
    mode: 'rapid_qa',
    topics: ['ckb', 'nervos', 'keepers'],
    difficulty: 'medium',
    entryFee: 5,
    startingPot: 20,
    minPlayers: 2,
    maxPlayers: 8,
    turnSecs: 20,
    winnersCount: 2,
    startAt: start,
    allowSponsorship: true,
  });
  const anime = createEvent({
    id: 'evt_demo_anime_rapid_01',
    address: 'ckt1qdemo...host',
    hostName: 'Relay Desk',
    name: 'Naruto × Bleach Rapid',
    description: 'Anime rapid session. Host does not know the questions.',
    category: 'Anime',
    mode: 'shrinking_clock',
    topics: ['naruto', 'bleach', 'one piece', 'anime'],
    difficulty: 'easy',
    entryFee: 3,
    startingPot: 10,
    minPlayers: 2,
    maxPlayers: 6,
    turnSecs: 15,
    winnersCount: 1,
    startAt: start,
    allowSponsorship: true,
  });
  // Pre-join a ghost so list looks alive
  try {
    joinEvent({
      eventId: anime.id,
      address: 'ckt1qdemo...alice',
      displayName: 'Alice',
    });
  } catch {
    /* ignore */
  }
}

export function listEvents(filter?: { status?: EventStatus }): { events: EventSummary[] } {
  let rows = [...eventsMap().values()];
  if (filter?.status) {
    rows = rows.filter((e) => e.status === filter.status);
  }
  rows.sort((a, b) => (a.startAt < b.startAt ? 1 : -1));
  return { events: rows.map(toEventSummary) };
}

export function listEventsForCommunity(communityId: string) {
  return listEvents().events.filter((e) => e.communityId === communityId);
}

export function getEvent(eventId: string): {
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
    communityId?: string | null;
    createdAt: string;
    startingPot: number;
    modeLabel: string;
    playRules: EventPlayRules;
    questionSource: QuestionSource;
    rulesSummary: string;
    communityName: string | null;
    communitySlug: string | null;
    eventCellId?: string | null;
    createTxHash?: string | null;
    eventOutPoint?: { txHash: string; index: string } | null;
    treasuryOutPoint?: { txHash: string; index: string } | null;
    lastTxHash?: string | null;
  };
  players: EventPlayer[];
  currentTurn: EventTurn | null;
  history: EventHistoryEntry[];
} {
  const event = requireEvent(eventId);
  return {
    event: {
      ...toEventSummary(event),
      topics: event.topics,
      difficulty: event.difficulty,
      hostAddress: event.hostAddress,
      turnSecs: event.turnSecs,
      winnersCount: event.winnersCount,
      minPlayers: event.minPlayers,
      allowSponsorship: event.allowSponsorship,
      sponsors: event.sponsors,
      endAt: event.endAt,
      communityId: event.communityId,
      createdAt: event.createdAt,
      startingPot: event.startingPot,
      modeLabel: EVENT_MODE_LABEL[event.mode],
      playRules: event.playRules ?? playRulesFromMode(event.mode),
      questionSource: event.questionSource ?? 'manual',
      rulesSummary: summarizePlayRules(event.playRules ?? playRulesFromMode(event.mode)),
      communityName: resolveCommunityName(event.communityId),
      communitySlug: resolveCommunitySlug(event.communityId),
      eventCellId: event.eventCellId ?? null,
      createTxHash: event.createTxHash ?? null,
      eventOutPoint: event.eventOutPoint ?? null,
      treasuryOutPoint: event.treasuryOutPoint ?? null,
      lastTxHash: event.lastTxHash ?? null,
    },
    players: event.players.map((p) => ({ ...p })),
    currentTurn: event.currentTurnId
      ? event.turns.find((t) => t.id === event.currentTurnId) ?? null
      : null,
    history: [...event.history],
  };
}

export function createEvent(input: {
  /** Optional stable id (demo seeds). */
  id?: string;
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
  /** ai | manual — AI is optional; pool always comes from host review. */
  questionSource?: QuestionSource;
  /** Reviewed / authored drafts. Required for publish when provided. */
  questions?: HostQuestionDraft[];
  /** Stackable prize / win / time / score rules. */
  playRules?: EventPlayRules;
  /** On-chain Event type-id (hex). */
  eventCellId?: string | null;
  createTxHash?: string | null;
  eventOutPoint?: { txHash: string; index: string } | null;
  treasuryOutPoint?: { txHash: string; index: string } | null;
}): RelayEvent {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new StoreError(
      'DATABASE_URL is required to create events. Events are stored in Neon, not locally.',
      503,
    );
  }
  const hostAddress = normalizeAddress(input.address);
  if (!hostAddress) throw new Error('Connect a wallet to create an event.');
  if (!input.name.trim()) throw new Error('Name the event.');
  if (!input.description.trim()) throw new Error('Add a short description.');

  const playRules = input.playRules ?? playRulesFromMode(input.mode ?? 'pot_rush');
  const mode: EventMode = input.mode ?? modeFromPlayRules(playRules);
  const topics = (input.topics?.length ? input.topics : ['general']).map((t) => t.trim());
  const turnSecs = Math.min(120, Math.max(5, input.turnSecs ?? 15));
  const difficulty = input.difficulty ?? 'medium';

  let pool;
  if (input.questions && input.questions.length > 0) {
    pool = commitHostQuestions(input.questions, {
      turnSecs,
      category: input.category ?? 'Custom',
    });
  } else {
    // Fallback for demos / old clients — still generate a pool.
    pool = generateQuestions({
      topics,
      difficulty,
      count: 12,
      mode,
      turnSecs,
    });
  }

  const event: RelayEvent = {
    id: input.id?.trim() || id('evt'),
    communityId: input.communityId ?? null,
    name: input.name.trim().slice(0, 80),
    description: input.description.trim().slice(0, 400),
    category: (input.category ?? 'Knowledge').slice(0, 40),
    mode,
    playRules,
    questionSource: input.questionSource ?? 'ai',
    topics,
    difficulty,
    status: 'registration',
    hostAddress,
    hostName: input.hostName || 'Host',
    entryFee: Math.max(0, input.entryFee ?? 0),
    startingPot: Math.max(0, input.startingPot ?? 0),
    pot: Math.max(0, input.startingPot ?? 0),
    bonusPot: 0,
    minPlayers: Math.max(2, input.minPlayers ?? 2),
    maxPlayers: Math.max(2, input.maxPlayers ?? 8),
    turnSecs,
    winnersCount: Math.max(1, Math.min(5, input.winnersCount ?? 2)),
    startAt: input.startAt ?? new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    endAt: null,
    createdAt: nowIso(),
    coverImageUrl: input.coverImageUrl ?? arenaCoverForSeed(input.name),
    allowSponsorship: input.allowSponsorship !== false,
    sponsors: [],
    players: [],
    turns: [],
    history: [],
    questionPool: pool,
    currentTurnId: null,
    chainJourneyId: null,
    eventCellId: input.eventCellId ?? null,
    createTxHash: input.createTxHash ?? null,
    eventOutPoint: input.eventOutPoint ?? null,
    treasuryOutPoint: input.treasuryOutPoint ?? null,
    lastTxHash: input.createTxHash ?? null,
  };
  eventsMap().set(event.id, event);
  markEventsDirty(event.id);
  // Best-effort vault write (may race before event row exists; respondWrite also persists).
  void persistRelayQuestionsBestEffort(event);
  void relayBus.emit('event.created', {
    eventId: event.id,
    actorAddress: hostAddress,
    payload: {
      mode: event.mode,
      name: event.name,
      questionSource: input.questionSource ?? 'ai',
      questionCount: pool.length,
    },
  });
  void relayBus.emit('event.registration_opened', { eventId: event.id });
  void relayBus.emit('question_generation.completed', {
    eventId: event.id,
    payload: { count: pool.length, source: input.questionSource ?? 'ai' },
  });
  return event;
}

/** Preview AI pool for host review — does not create an event. */
export function previewGenerateQuestions(input: {
  topics?: string[];
  difficulty?: QuestionDifficulty;
  count?: number;
  mode?: EventMode;
  turnSecs?: number;
  instructions?: string;
  questionType?: QuestionType;
}): { questions: HostQuestionDraft[] } {
  const topics = (input.topics?.length ? input.topics : ['general']).map((t) => t.trim());
  const count = Math.min(40, Math.max(1, input.count ?? 10));
  const generated = generateQuestions({
    topics,
    difficulty: input.difficulty ?? 'medium',
    count,
    mode: input.mode,
    turnSecs: input.turnSecs ?? 15,
    instructions: input.instructions,
    questionType: input.questionType ?? 'multiple_choice',
  });
  void relayBus.emit('question_generation.completed', {
    payload: { count: generated.length, preview: true },
  });
  return { questions: toHostDrafts(generated) };
}

export function joinEvent(input: {
  eventId: string;
  address: string;
  displayName: string;
  joinTxHash?: string | null;
  playerCellId?: string | null;
  participantOutPoint?: { txHash: string; index: string } | null;
  eventOutPoint?: { txHash: string; index: string } | null;
  treasuryOutPoint?: { txHash: string; index: string } | null;
  onChainPending?: boolean;
}): { event: EventSummary; player: EventPlayer } {
  const event = requireEvent(input.eventId);
  const address = normalizeAddress(input.address);
  void relayBus.emit('player.join_requested', {
    eventId: event.id,
    actorAddress: address,
  });
  if (
    !canJoinEvent({
      status: event.status,
      playerCount: event.players.length,
      maxPlayers: event.maxPlayers,
    })
  ) {
    void relayBus.emit('player.join_failed', {
      eventId: event.id,
      actorAddress: address,
      payload: { reason: 'closed_or_full' },
    });
    throw new Error('This event is no longer open to join.');
  }
  if (event.players.some((p) => normalizeAddress(p.address) === address)) {
    void relayBus.emit('player.join_failed', {
      eventId: event.id,
      actorAddress: address,
      payload: { reason: 'already_joined' },
    });
    throw new Error('You already joined.');
  }
  if (!address) throw new Error('Connect wallet to join.');

  const hasChainProof = Boolean(
    input.joinTxHash?.trim() &&
      (input.participantOutPoint?.txHash || input.eventOutPoint?.txHash),
  );
  // Lobby join (no chain fields) stays pending; verified chain join clears the flag.
  const onChainPending = hasChainProof ? false : (input.onChainPending ?? true);

  const player: EventPlayer = {
    id: id('pl'),
    eventId: event.id,
    address,
    displayName: input.displayName.trim() || 'Keeper',
    stake: event.entryFee,
    score: 0,
    status: 'registered',
    joinedAt: nowIso(),
    correctCount: 0,
    totalAnswerMs: 0,
    answers: 0,
    joinTxHash: input.joinTxHash ?? null,
    playerCellId: input.playerCellId ?? null,
    participantOutPoint: input.participantOutPoint ?? null,
    onChainPending,
  };
  event.players.push(player);
  if (input.eventOutPoint) event.eventOutPoint = input.eventOutPoint;
  if (input.treasuryOutPoint) event.treasuryOutPoint = input.treasuryOutPoint;
  if (input.joinTxHash) event.lastTxHash = input.joinTxHash;
  const stacked = resolveStackedRules({ mode: event.mode, playRules: event.playRules });
  if (stacked.joinPotBump > 0) {
    event.bonusPot += stacked.joinPotBump;
  }
  recomputePot(event);
  const prevStatus = event.status;
  recomputeStatus(event);
  void relayBus.emit('player.joined', {
    eventId: event.id,
    actorAddress: address,
    payload: { playerId: player.id, stake: player.stake, onChain: hasChainProof },
  });
  void relayBus.emit('stake.confirmed', {
    eventId: event.id,
    actorAddress: address,
    payload: { amount: player.stake },
  });
  void relayBus.emit('prize_pool.updated', {
    eventId: event.id,
    payload: { pot: event.pot },
  });
  if (prevStatus !== event.status && event.status === 'ready') {
    void relayBus.emit('event.ready', { eventId: event.id });
  }
  if (event.players.length >= event.maxPlayers) {
    void relayBus.emit('event.registration_closed', { eventId: event.id });
  }
  maybeAutoStart(event);
  markEventsDirty(event.id);
  return { event: toEventSummary(event), player };
}

export function sponsorEvent(input: {
  eventId: string;
  name: string;
  amount: number;
  note?: string;
  txHash?: string | null;
}): EventSummary {
  const event = requireEvent(input.eventId);
  if (!event.allowSponsorship) throw new Error('Sponsorship is off for this event.');
  if (event.status === 'finished' || event.status === 'settled') {
    throw new Error('Event already finished.');
  }
  const sponsorName = input.name.trim();
  if (!sponsorName) throw new Error('Sponsor name is required.');
  const amount = Math.max(0, Math.floor(input.amount));
  const txHash = input.txHash?.trim() || '';
  const pending = !txHash;
  const noteParts = [input.note?.trim()].filter(Boolean) as string[];
  if (pending) noteParts.push('[pending-payment]');
  const note = noteParts.length > 0 ? noteParts.join(' ') : undefined;

  void relayBus.emit('sponsor.contribution_created', {
    eventId: event.id,
    payload: { name: sponsorName, amount, pending },
  });
  event.sponsors.push({
    id: id('sp'),
    name: sponsorName,
    amount,
    note,
    at: nowIso(),
  });
  recomputePot(event);
  void relayBus.emit('sponsor.contribution_confirmed', {
    eventId: event.id,
    payload: { amount, pot: event.pot, pending },
  });
  void relayBus.emit('prize_pool.updated', {
    eventId: event.id,
    payload: { pot: event.pot },
  });
  markEventsDirty(event.id);
  return toEventSummary(event);
}

export function startEvent(input: { eventId: string; address: string }): {
  event: EventSummary;
  turn: EventTurn;
  question: PublicQuestion;
} {
  const event = requireEvent(input.eventId);
  if (input.address.toLowerCase() !== event.hostAddress.toLowerCase()) {
    throw new Error('Only the host can start the event.');
  }
  if (event.status === 'live') throw new Error('Already live.');
  if (event.status === 'finished' || event.status === 'settled') {
    throw new Error('Event already finished.');
  }
  recomputeStatus(event);
  if (
    !canStartEvent({
      status: event.status,
      playerCount: event.players.length,
      minPlayers: event.minPlayers,
    })
  ) {
    throw new Error(`Need at least ${event.minPlayers} players.`);
  }

  const { turn, question } = beginLive(event);
  return {
    event: toEventSummary(event),
    turn,
    question,
  };
}

export function getCurrentTurn(eventId: string): {
  turn: EventTurn | null;
  question: PublicQuestion | null;
  youAreHolder: boolean;
  holderName: string | null;
} {
  const event = requireEvent(eventId);
  const turn = event.currentTurnId
    ? event.turns.find((t) => t.id === event.currentTurnId) ?? null
    : null;
  if (!turn) {
    return { turn: null, question: null, youAreHolder: false, holderName: null };
  }
  const q = event.questionPool.find((x) => x.id === turn.questionId);
  const holder = event.players.find((p) => p.id === turn.currentPlayerId);
  return {
    turn,
    question: q ? toPublicQuestion(q) : null,
    youAreHolder: false,
    holderName: holder?.displayName ?? null,
  };
}

export function getQuestionForHolder(input: {
  eventId: string;
  address: string;
}): {
  turn: EventTurn;
  question: PublicQuestion;
  isHolder: boolean;
} {
  const event = requireEvent(input.eventId);
  const turn = event.currentTurnId
    ? event.turns.find((t) => t.id === event.currentTurnId)
    : null;
  if (!turn || turn.state !== 'pending') {
    throw new Error('No active turn.');
  }
  const holder = event.players.find((p) => p.id === turn.currentPlayerId);
  const isHolder = Boolean(
    holder && holder.address.toLowerCase() === input.address.toLowerCase(),
  );
  const q = event.questionPool.find((x) => x.id === turn.questionId);
  if (!q) throw new Error('Question missing.');
  return { turn, question: toPublicQuestion(q), isHolder };
}

function finishIfNeeded(event: RelayEvent): boolean {
  const alive = activePlayers(event);
  const maxRounds = event.players.length * 3;
  const lastRound = event.turns[event.turns.length - 1]?.round ?? 0;
  if (alive.length <= 1 || lastRound >= maxRounds) {
    settleEvent(event);
    return true;
  }
  return false;
}

function settleEvent(event: RelayEvent): void {
  event.status = 'finished';
  event.endAt = nowIso();
  event.currentTurnId = null;
  markEventsDirty(event.id);
  void relayBus.emit('event.finished', { eventId: event.id });
  event.players.forEach((p) => {
    if (p.status === 'active' || p.status === 'waiting' || p.status === 'registered') {
      p.status = 'finished';
    }
  });
  const ranked = [...event.players].sort((a, b) => b.score - a.score || b.correctCount - a.correctCount);
  const winners = ranked.slice(0, event.winnersCount);
  winners.forEach((w) => {
    w.status = 'winner';
  });
  event.status = 'settled';
  void relayBus.emit('reward.calculated', {
    eventId: event.id,
    payload: {
      pot: event.pot,
      winners: winners.map((w) => ({ address: w.address, score: w.score })),
    },
  });
  void relayBus.emit('event.settled', {
    eventId: event.id,
    payload: { pot: event.pot, winnersCount: winners.length },
  });
}

export function submitAnswer(input: {
  eventId: string;
  address: string;
  selectedIndex: number;
}): {
  correct: boolean;
  explanation?: string;
  event: EventSummary;
  turn: EventTurn;
  nextTurn: EventTurn | null;
  nextQuestion: PublicQuestion | null;
  settled: boolean;
} {
  const event = requireEvent(input.eventId);
  if (event.status !== 'live') throw new Error('Event is not live.');
  const turn = event.currentTurnId
    ? event.turns.find((t) => t.id === event.currentTurnId)
    : null;
  if (!turn || turn.state !== 'pending') throw new Error('No pending turn.');

  const holder = event.players.find((p) => p.id === turn.currentPlayerId);
  if (!holder || holder.address.toLowerCase() !== input.address.toLowerCase()) {
    throw new Error('Only the current Cell holder can answer.');
  }

  const timedOut = Date.now() > new Date(turn.deadlineAt).getTime();
  const q = event.questionPool.find((x) => x.id === turn.questionId);
  if (!q || q.correctIndex === undefined) throw new Error('Question missing.');

  const answerMs = Math.max(0, Date.now() - new Date(turn.startedAt).getTime());
  const rules = resolveStackedRules({ mode: event.mode, playRules: event.playRules });
  void relayBus.emit('turn.answer_submitted', {
    eventId: event.id,
    actorAddress: input.address,
    payload: { turnId: turn.id, selectedIndex: input.selectedIndex },
  });

  let correct = false;
  if (timedOut) {
    turn.state = 'timed_out';
    turn.correct = false;
    if (rules.eliminateOnMiss) holder.status = 'eliminated';
    void relayBus.emit('turn.timeout', {
      eventId: event.id,
      actorAddress: input.address,
      payload: { turnId: turn.id },
    });
  } else {
    correct = input.selectedIndex === q.correctIndex;
    turn.state = 'answered';
    turn.selectedIndex = input.selectedIndex;
    turn.correct = correct;
    turn.answeredAt = nowIso();
    holder.answers += 1;
    holder.totalAnswerMs += answerMs;
    void relayBus.emit('turn.answer_evaluated', {
      eventId: event.id,
      actorAddress: input.address,
      payload: { correct, turnId: turn.id },
    });
    if (correct) {
      holder.correctCount += 1;
      holder.score += rules.pointsOnCorrect;
      if (rules.potBonusOnCorrect > 0) {
        event.bonusPot += rules.potBonusOnCorrect;
        recomputePot(event);
        void relayBus.emit('prize_pool.updated', {
          eventId: event.id,
          payload: { pot: event.pot },
        });
      }
      void relayBus.emit('turn.correct', {
        eventId: event.id,
        actorAddress: input.address,
        payload: { points: rules.pointsOnCorrect },
      });
    } else {
      if (rules.eliminateOnMiss) holder.status = 'eliminated';
      void relayBus.emit('turn.incorrect', {
        eventId: event.id,
        actorAddress: input.address,
        payload: { turnId: turn.id },
      });
      if (holder.status === 'eliminated') {
        void relayBus.emit('player.eliminated', {
          eventId: event.id,
          actorAddress: input.address,
        });
      }
    }
  }

  const hist: EventHistoryEntry = {
    id: id('hx'),
    at: nowIso(),
    playerId: holder.id,
    displayName: holder.displayName,
    round: turn.round,
    correct: timedOut ? false : correct,
    timedOut,
    scoreDelta: correct && !timedOut ? rules.pointsOnCorrect : 0,
    answerMs,
  };
  event.history.push(hist);
  markEventsDirty(event.id);

  // Pass to next (PassableState — consume current, mint next)
  holder.status = holder.status === 'eliminated' ? 'eliminated' : 'waiting';
  turn.state = turn.state === 'timed_out' ? 'timed_out' : 'passed';
  void relayBus.emit('turn.passed', {
    eventId: event.id,
    actorAddress: input.address,
    payload: { fromTurnId: turn.id },
  });

  const next = nextPlayerAfter(event, holder.id);
  const settled = finishIfNeeded(event) || !next;

  if (settled || !next) {
    return {
      correct: Boolean(turn.correct),
      explanation: q.explanation,
      event: toEventSummary(event),
      turn,
      nextTurn: null,
      nextQuestion: null,
      settled: true,
    };
  }

  next.status = 'active';
  const nextRound = turn.round + 1;
  const nextQ =
    event.questionPool[Math.min(nextRound - 1, event.questionPool.length - 1)] ??
    event.questionPool[0]!;
  const secs = turnSecsForRound(event, nextRound);
  const nextTurn: EventTurn = {
    id: id('turn'),
    eventId: event.id,
    round: nextRound,
    currentPlayerId: next.id,
    previousPlayerId: holder.id,
    questionId: nextQ.id,
    questionCommit: nextQ.commit,
    startedAt: nowIso(),
    deadlineAt: new Date(Date.now() + secs * 1000).toISOString(),
    state: 'pending',
  };
  event.turns.push(nextTurn);
  event.currentTurnId = nextTurn.id;
  void relayBus.emit('turn.created', {
    eventId: event.id,
    actorAddress: next.address,
    payload: { turnId: nextTurn.id, round: nextRound },
  });
  void relayBus.emit('turn.started', {
    eventId: event.id,
    actorAddress: next.address,
    payload: { turnId: nextTurn.id, deadlineAt: nextTurn.deadlineAt },
  });
  void relayBus.emit('round.advanced', {
    eventId: event.id,
    payload: { round: nextRound },
  });

  return {
    correct: Boolean(turn.correct),
    explanation: q.explanation,
    event: toEventSummary(event),
    turn,
    nextTurn,
    nextQuestion: toPublicQuestion({ ...nextQ, timeLimitSec: secs }),
    settled: false,
  };
}

/**
 * Authoritative timeout — anyone may call once deadline has passed.
 * Frontend countdown is display-only; this advances the baton.
 */
export function timeoutTurn(input: {
  eventId: string;
  address?: string;
}): {
  timedOut: true;
  event: EventSummary;
  turn: EventTurn;
  nextTurn: EventTurn | null;
  nextQuestion: PublicQuestion | null;
  settled: boolean;
  holderName: string;
} {
  const event = requireEvent(input.eventId);
  if (event.status !== 'live') throw new Error('Event is not live.');
  const turn = event.currentTurnId
    ? event.turns.find((t) => t.id === event.currentTurnId)
    : null;
  if (!turn || turn.state !== 'pending') throw new Error('No pending turn.');
  if (Date.now() <= new Date(turn.deadlineAt).getTime()) {
    throw new Error('Turn has not expired yet.');
  }

  const holder = event.players.find((p) => p.id === turn.currentPlayerId);
  if (!holder) throw new Error('Current player missing.');

  const q = event.questionPool.find((x) => x.id === turn.questionId);
  const rules = resolveStackedRules({ mode: event.mode, playRules: event.playRules });

  turn.state = 'timed_out';
  turn.correct = false;
  if (rules.eliminateOnMiss) holder.status = 'eliminated';

  void relayBus.emit('turn.timeout', {
    eventId: event.id,
    actorAddress: input.address ?? holder.address,
    payload: { turnId: turn.id, holder: holder.address },
  });

  event.history.push({
    id: id('hx'),
    at: nowIso(),
    playerId: holder.id,
    displayName: holder.displayName,
    round: turn.round,
    correct: false,
    timedOut: true,
    scoreDelta: 0,
  });
  markEventsDirty(event.id);

  holder.status = holder.status === 'eliminated' ? 'eliminated' : 'waiting';
  turn.state = 'timed_out';
  void relayBus.emit('turn.passed', {
    eventId: event.id,
    actorAddress: holder.address,
    payload: { fromTurnId: turn.id, reason: 'timeout' },
  });
  if (holder.status === 'eliminated') {
    void relayBus.emit('player.eliminated', {
      eventId: event.id,
      actorAddress: holder.address,
    });
  }

  const next = nextPlayerAfter(event, holder.id);
  const settled = finishIfNeeded(event) || !next;

  if (settled || !next) {
    return {
      timedOut: true,
      event: toEventSummary(event),
      turn,
      nextTurn: null,
      nextQuestion: null,
      settled: true,
      holderName: holder.displayName,
    };
  }

  next.status = 'active';
  const nextRound = turn.round + 1;
  const nextQ =
    event.questionPool[Math.min(nextRound - 1, event.questionPool.length - 1)] ??
    event.questionPool[0]!;
  const secs = turnSecsForRound(event, nextRound);
  const nextTurn: EventTurn = {
    id: id('turn'),
    eventId: event.id,
    round: nextRound,
    currentPlayerId: next.id,
    previousPlayerId: holder.id,
    questionId: nextQ.id,
    questionCommit: nextQ.commit,
    startedAt: nowIso(),
    deadlineAt: new Date(Date.now() + secs * 1000).toISOString(),
    state: 'pending',
  };
  event.turns.push(nextTurn);
  event.currentTurnId = nextTurn.id;
  void relayBus.emit('turn.created', {
    eventId: event.id,
    actorAddress: next.address,
    payload: { turnId: nextTurn.id, round: nextRound },
  });
  void relayBus.emit('turn.started', {
    eventId: event.id,
    actorAddress: next.address,
    payload: { turnId: nextTurn.id, deadlineAt: nextTurn.deadlineAt },
  });
  void relayBus.emit('round.advanced', {
    eventId: event.id,
    payload: { round: nextRound },
  });

  return {
    timedOut: true,
    event: toEventSummary(event),
    turn,
    nextTurn,
    nextQuestion: toPublicQuestion({ ...nextQ, timeLimitSec: secs }),
    settled: false,
    holderName: holder.displayName,
  };
}

export function getEventResults(eventId: string): EventResults {
  const event = requireEvent(eventId);
  if (event.status !== 'finished' && event.status !== 'settled') {
    // Allow peeking mid-game rankings
  }
  const ranked = [...event.players].sort(
    (a, b) => b.score - a.score || b.correctCount - a.correctCount,
  );
  const winnerSlice = ranked.slice(0, event.winnersCount);
  const totalScore = winnerSlice.reduce((s, w) => s + Math.max(1, w.score), 0) || 1;
  const rankings = ranked.map((p, i) => {
    const isWinner = winnerSlice.some((w) => w.id === p.id);
    const payout = isWinner
      ? Math.floor((event.pot * Math.max(1, p.score)) / totalScore)
      : 0;
    return {
      playerId: p.id,
      displayName: p.displayName,
      score: p.score,
      correctCount: p.correctCount,
      avgMs: p.answers ? Math.round(p.totalAnswerMs / p.answers) : 0,
      status: p.status,
      place: i + 1,
      payout,
    };
  });
  const lineage = event.history.map((h) => ({
    displayName: h.displayName,
    round: h.round,
    correct: h.correct,
  }));
  return {
    event: toEventSummary(event),
    rankings,
    lineage,
    history: [...event.history],
  };
}

export function getLeaderboard(): {
  rows: Array<{ displayName: string; wins: number; score: number; events: number }>;
} {
  const agg = new Map<string, { displayName: string; wins: number; score: number; events: number }>();
  for (const event of eventsMap().values()) {
    for (const p of event.players) {
      const key = p.address.toLowerCase();
      const row = agg.get(key) ?? {
        displayName: p.displayName,
        wins: 0,
        score: 0,
        events: 0,
      };
      row.events += 1;
      row.score += p.score;
      if (p.status === 'winner') row.wins += 1;
      agg.set(key, row);
    }
  }
  return {
    rows: [...agg.values()].sort((a, b) => b.wins - a.wins || b.score - a.score).slice(0, 20),
  };
}

/** Derived passport stats from the current events working set. */
export function passportStatsForAddress(address: string): {
  completedRelayIds: string[];
  keeperTurns: number;
  eventsPlayed: number;
  wins: number;
  contributionXp: number;
} {
  const key = normalizeAddress(address);
  const completedRelayIds: string[] = [];
  let keeperTurns = 0;
  let eventsPlayed = 0;
  let wins = 0;
  let contributionXp = 0;

  for (const event of eventsMap().values()) {
    const player = event.players.find((p) => normalizeAddress(p.address) === key);
    if (!player) continue;
    eventsPlayed += 1;
    contributionXp += player.score;
    keeperTurns += player.answers;
    if (player.status === 'winner') wins += 1;
    if (event.status === 'finished' || event.status === 'settled') {
      completedRelayIds.push(event.id);
    }
  }

  return { completedRelayIds, keeperTurns, eventsPlayed, wins, contributionXp };
}
