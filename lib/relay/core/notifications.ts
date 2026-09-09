/**
 * Notification intents derived from domain events.
 * Channels (WS / push / email) subscribe here — no scatter of sendNotification().
 */

import {
  relayBus,
  type RelayDomainEvent,
  type RelayDomainEventType,
} from './domain-events';

export type NotificationChannel = 'websocket' | 'push' | 'email';

export type NotificationIntent = {
  id: string;
  channelHints: NotificationChannel[];
  template: string;
  eventId?: string;
  audience: 'holder' | 'players' | 'host' | 'spectators' | 'all';
  actorAddress?: string;
  at: string;
  payload?: Record<string, unknown>;
};

type NotificationHandler = (intent: NotificationIntent) => void | Promise<void>;

const handlers = new Set<NotificationHandler>();
const recentIntents: NotificationIntent[] = [];

/** Map domain events → notification intents (subset that users care about). */
const DOMAIN_TO_NOTIFY: Partial<
  Record<
    RelayDomainEventType,
    { template: string; audience: NotificationIntent['audience']; channels: NotificationChannel[] }
  >
> = {
  'event.ready': {
    template: 'notification.event_starting',
    audience: 'players',
    channels: ['websocket', 'push'],
  },
  'event.started': {
    template: 'notification.event_started',
    audience: 'all',
    channels: ['websocket', 'push'],
  },
  'event.cancelled': {
    template: 'notification.event_cancelled',
    audience: 'players',
    channels: ['websocket', 'push', 'email'],
  },
  'player.joined': {
    template: 'notification.player_joined',
    audience: 'host',
    channels: ['websocket'],
  },
  'turn.started': {
    template: 'notification.turn_your_turn',
    audience: 'holder',
    channels: ['websocket', 'push'],
  },
  'turn.reminder_sent': {
    template: 'notification.turn_ending',
    audience: 'holder',
    channels: ['websocket', 'push'],
  },
  'event.settled': {
    template: 'notification.you_won',
    audience: 'players',
    channels: ['websocket', 'push', 'email'],
  },
  'reward.claim_created': {
    template: 'notification.reward_available',
    audience: 'players',
    channels: ['websocket', 'email'],
  },
  'reward.claimed': {
    template: 'notification.reward_claimed',
    audience: 'players',
    channels: ['websocket'],
  },
  'sponsor.contribution_confirmed': {
    template: 'notification.sponsor_event_live',
    audience: 'all',
    channels: ['websocket'],
  },
};

export function onNotification(handler: NotificationHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function getRecentNotifications(limit = 50): NotificationIntent[] {
  return recentIntents.slice(-limit);
}

async function fanOut(intent: NotificationIntent): Promise<void> {
  recentIntents.push(intent);
  if (recentIntents.length > 200) recentIntents.shift();
  for (const h of handlers) {
    try {
      await h(intent);
    } catch (err) {
      console.warn('[relay-notify] handler failed', intent.template, err);
    }
  }
}

function fromDomain(event: RelayDomainEvent): NotificationIntent | null {
  const map = DOMAIN_TO_NOTIFY[event.type];
  if (!map) return null;
  return {
    id: `ni_${event.id}`,
    channelHints: map.channels,
    template: map.template,
    eventId: event.eventId,
    audience: map.audience,
    actorAddress: event.actorAddress,
    at: event.at,
    payload: event.payload,
  };
}

/** Wire once at server boot — domain bus → notification intents. */
let wired = false;
export function wireNotificationBridge(): void {
  if (wired) return;
  wired = true;
  relayBus.on('*', async (event) => {
    const intent = fromDomain(event);
    if (intent) await fanOut(intent);
  });
}
