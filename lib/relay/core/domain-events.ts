/**
 * @relay/core domain events — complete catalog from the 1–23 backend brief.
 *
 * The Event Bus fans these to WebSocket / push / email later.
 * App + future `@relay-ckb/game` share this vocabulary.
 */

export type RelayDomainEventType =
  // EVENT LIFECYCLE
  | 'event.created'
  | 'event.updated'
  | 'event.registration_opened'
  | 'event.registration_closed'
  | 'event.ready'
  | 'event.cancelled'
  | 'event.started'
  | 'event.paused'
  | 'event.resumed'
  | 'event.finished'
  | 'event.settled'
  // PLAYER
  | 'player.join_requested'
  | 'player.joined'
  | 'player.join_failed'
  | 'player.left'
  | 'player.verified'
  | 'player.disqualified'
  | 'player.eliminated'
  | 'player.reinstated'
  // STAKE / MONEY
  | 'stake.initiated'
  | 'stake.confirmed'
  | 'stake.failed'
  | 'stake.refunded'
  | 'sponsor.contribution_created'
  | 'sponsor.contribution_confirmed'
  | 'prize_pool.updated'
  | 'reward.calculated'
  | 'reward.claim_created'
  | 'reward.claimed'
  | 'reward.failed'
  // TURN (PassableState)
  | 'turn.created'
  | 'turn.started'
  | 'turn.question_assigned'
  | 'turn.reminder_sent'
  | 'turn.answer_submitted'
  | 'turn.answer_evaluated'
  | 'turn.correct'
  | 'turn.incorrect'
  | 'turn.timeout'
  | 'turn.expired'
  | 'turn.passed'
  | 'turn.failed'
  // ROUND
  | 'round.started'
  | 'round.completed'
  | 'round.advanced'
  | 'round.skipped'
  | 'round.final_started'
  // QUESTION / AI
  | 'question_generation.requested'
  | 'question_generation.started'
  | 'question_generation.completed'
  | 'question_generation.failed'
  | 'question.validation_started'
  | 'question.validation_passed'
  | 'question.validation_failed'
  | 'question.assigned'
  | 'question.rejected'
  | 'question.replaced'
  | 'ai.question_batch_requested'
  | 'ai.question_generated'
  | 'ai.question_validation_requested'
  | 'ai.question_validated'
  | 'ai.question_rejected'
  | 'ai.question_deduplicated'
  | 'ai.difficulty_adjusted'
  | 'ai.explanation_generated'
  // CKB
  | 'ckb.event_cell_created'
  | 'ckb.event_settled'
  | 'ckb.sponsor_cell_created'
  | 'ckb.transaction_built'
  | 'ckb.transaction_signed'
  | 'ckb.transaction_submitted'
  | 'ckb.transaction_pending'
  | 'ckb.transaction_confirmed'
  | 'ckb.transaction_failed'
  | 'ckb.turn_transition_confirmed'
  | 'ckb.stake_confirmed'
  | 'ckb.settlement_confirmed'
  | 'ckb.cell_detected'
  | 'ckb.cell_consumed'
  | 'ckb.cell_created'
  | 'ckb.state_transition_detected'
  // NOTIFICATIONS (outbound intents)
  | 'notification.turn_your_turn'
  | 'notification.turn_starting'
  | 'notification.turn_ending'
  | 'notification.event_starting'
  | 'notification.event_started'
  | 'notification.event_cancelled'
  | 'notification.player_joined'
  | 'notification.event_full'
  | 'notification.you_won'
  | 'notification.you_lost'
  | 'notification.reward_available'
  | 'notification.reward_claimed'
  | 'notification.sponsor_event_live';

export type RelayDomainEvent<T extends RelayDomainEventType = RelayDomainEventType> = {
  id: string;
  type: T;
  at: string;
  eventId?: string;
  actorAddress?: string;
  payload?: Record<string, unknown>;
};

export type RelayDomainListener = (event: RelayDomainEvent) => void | Promise<void>;

function newId(): string {
  return `de_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * In-process event bus (Phase 1).
 * Swap implementation for Redis Streams / BullMQ without changing emitters.
 */
class RelayEventBus {
  private listeners = new Map<RelayDomainEventType | '*', Set<RelayDomainListener>>();
  private recent: RelayDomainEvent[] = [];
  private readonly maxRecent = 200;

  on(type: RelayDomainEventType | '*', listener: RelayDomainListener): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  async emit(
    type: RelayDomainEventType,
    input?: {
      eventId?: string;
      actorAddress?: string;
      payload?: Record<string, unknown>;
    },
  ): Promise<RelayDomainEvent> {
    const event: RelayDomainEvent = {
      id: newId(),
      type,
      at: new Date().toISOString(),
      eventId: input?.eventId,
      actorAddress: input?.actorAddress,
      payload: input?.payload,
    };
    this.recent.push(event);
    if (this.recent.length > this.maxRecent) this.recent.shift();

    const targets = [
      ...(this.listeners.get(type) ?? []),
      ...(this.listeners.get('*') ?? []),
    ];
    for (const listener of targets) {
      try {
        await listener(event);
      } catch (err) {
        console.warn('[relay-bus] listener failed', type, err);
      }
    }
    return event;
  }

  /** Debug / admin — last N domain events. */
  getRecent(limit = 50): RelayDomainEvent[] {
    return this.recent.slice(-limit);
  }
}

/** Singleton for the Keepers app process. */
export const relayBus = new RelayEventBus();
