import type { OutPointRef } from '@/lib/crown/rooms';

const KEY = 'keepers-crown-bids';

function read(): Record<string, OutPointRef> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Record<string, OutPointRef>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function write(all: Record<string, OutPointRef>) {
  window.localStorage.setItem(KEY, JSON.stringify(all));
}

function slot(id: string, address: string) {
  return `${id}:${address.trim().toLowerCase()}`;
}

export function rememberedBid(id: string, address: string): OutPointRef | null {
  if (!address.trim()) return null;
  return read()[slot(id, address)] ?? null;
}

export function rememberBid(id: string, address: string, bid: OutPointRef) {
  const all = read();
  all[slot(id, address)] = bid;
  write(all);
}

export function forgetBid(id: string, address: string) {
  const all = read();
  delete all[slot(id, address)];
  write(all);
}
