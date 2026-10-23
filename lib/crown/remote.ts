import {
  roomFromStored,
  roomToStored,
  type CrownRoom,
  type StoredRoom,
} from '@/lib/crown/rooms';
import { noteServerTime } from '@/lib/crown/clock';
import type { CrownSeat } from '@/lib/crown/seats';

export type { CrownSeat };

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) {
    throw new Error(data.message || 'The crown lobby could not be reached.');
  }
  return data;
}

export async function publishCrown(room: CrownRoom, hostAddress?: string | null): Promise<void> {
  await send('/api/crowns', 'POST', {
    room: roomToStored({ ...room, hostAddress: hostAddress ?? room.hostAddress }),
    hostAddress: hostAddress ?? room.hostAddress,
  });
}

export async function pushCrownState(room: CrownRoom): Promise<void> {
  await send('/api/crowns', 'PUT', { room: roomToStored(room) });
}

export async function fetchCrownList(): Promise<CrownRoom[]> {
  const rooms = await send<StoredRoom[]>('/api/crowns', 'GET');
  return rooms.map(roomFromStored);
}

export async function fetchCrown(
  id: string,
): Promise<{ room: CrownRoom; seats: CrownSeat[] } | null> {
  const sentAt = Date.now();
  const response = await fetch(`/api/crowns/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (response.status === 404) return null;
  const data = (await response.json()) as {
    room?: StoredRoom;
    seats?: CrownSeat[];
    now?: number;
    message?: string;
  };
  if (!response.ok || !data.room) return null;
  if (typeof data.now === 'number') noteServerTime(data.now, sentAt);
  return { room: roomFromStored(data.room), seats: data.seats ?? [] };
}

export async function joinCrownRemote(
  id: string,
  seat: { address: string; displayName: string; bidOutPoint?: CrownSeat['bidOutPoint']; clearBid?: boolean },
): Promise<{ room: CrownRoom; seats: CrownSeat[] }> {
  const data = await send<{ room: StoredRoom; seats: CrownSeat[] }>(`/api/crowns/${encodeURIComponent(id)}`, 'POST', seat);
  return { room: roomFromStored(data.room), seats: data.seats };
}

export async function deleteCrownRemote(id: string): Promise<void> {
  await send(`/api/crowns/${encodeURIComponent(id)}`, 'DELETE');
}
