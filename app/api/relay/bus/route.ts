import { NextResponse } from 'next/server';
import {
  getRecentNotifications,
  relayBus,
  wireNotificationBridge,
} from '@/lib/relay';
import { getSession } from '@/lib/server/auth';

/**
 * Debug peek at in-process domain bus.
 * Production: requires ADMIN_API_SECRET header or authenticated session.
 */
export async function GET(request: Request) {
  const admin = process.env.ADMIN_API_SECRET?.trim();
  const header = request.headers.get('x-admin-secret')?.trim();
  const session = getSession(request);

  if (process.env.NODE_ENV === 'production') {
    if (!admin || header !== admin) {
      if (!session) {
        return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
      }
    }
  }

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
