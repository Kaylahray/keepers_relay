/**
 * Relay Stateful Event Engine — extractable SDK surface.
 *
 * Today: lives under Keepers Relay (`lib/relay`).
 * Later: split into `@relay-ckb/core`, `@relay-ckb/ckb`, `@relay-ckb/game`, …
 *
 * CKB cell layouts / tx builders: import from `@/lib/relay/ckb` (or `lib/registry/*`).
 * Keep this barrel free of `"use client"` registry deps so the Event service can import it.
 */

export {
  EVENT_STATUS_TRANSITIONS,
  MODE_RULES,
  assertEventStatusTransition,
  canJoinEvent,
  canStartEvent,
  canTransitionEventStatus,
  computeDisplayedPot,
  turnSecsForRound,
  resolveStackedRules,
  turnSecsForStackedRound,
  type EventMode,
  type EventPlayerStatus,
  type EventStatus,
  type ModeRules,
  type TurnState,
} from './core/state-machine';

export {
  relayBus,
  type RelayDomainEvent,
  type RelayDomainEventType,
  type RelayDomainListener,
} from './core/domain-events';

export {
  getRecentNotifications,
  onNotification,
  wireNotificationBridge,
  type NotificationChannel,
  type NotificationIntent,
} from './core/notifications';
