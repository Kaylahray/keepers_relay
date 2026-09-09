import { NextResponse } from 'next/server';
import {
  getRecentNotifications,
  relayBus,
  wireNotificationBridge,
} from '@/lib/relay';

/**
 * Debug / admin peek at the in-process domain event bus + notification intents.
 * Phase 1: process memory. Phase 2+: Neon `relay_domain_events` + WS fan-out.
 */
export async function GET(request: Request) {
  wireNotificationBridge();
  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 40) || 40));
  const kind = searchParams.get('kind') ?? 'domain';

  if (kind === 'notifications') {
    return NextResponse.json({
      notifications: getRecentNotifications(limit),
    });
  }

  return NextResponse.json({
    domainEvents: relayBus.getRecent(limit),
  });
}
