import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Old Chain Letter home feed removed — use /api/events. */
export function GET() {
  return NextResponse.json(
    { message: 'Home feed removed. Use /api/events and /api/communities.' },
    { status: 410 },
  );
}

export function POST() {
  return GET();
}
