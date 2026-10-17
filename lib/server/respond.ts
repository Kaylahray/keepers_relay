import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/server/errors';

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  const lower = message.toLowerCase();
  if (
    lower.includes('already') ||
    lower.includes('only the host') ||
    lower.includes('not open') ||
    lower.includes('connect') ||
    lower.includes('missing') ||
    lower.includes('required') ||
    lower.includes('closed')
  ) {
    return NextResponse.json({ message }, { status: 400 });
  }
  return NextResponse.json({ message }, { status: 500 });
}

export async function respond<T>(run: () => T | Promise<T>): Promise<NextResponse> {
  try {
    const data = await run();
    return NextResponse.json(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function readBody<T>(request: Request): Promise<Partial<T>> {
  try {
    return (await request.json()) as Partial<T>;
  } catch {
    return {};
  }
}
