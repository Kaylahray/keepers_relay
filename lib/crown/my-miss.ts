const KEY = 'keepers-crown-misses';

export type QuestionMiss = { cursor: number; index: number };

function read(): Record<string, QuestionMiss> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Record<string, QuestionMiss>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function write(all: Record<string, QuestionMiss>) {
  window.localStorage.setItem(KEY, JSON.stringify(all));
}

function slot(id: string, player: string) {
  return `${id}:${player.trim().toLowerCase() || 'local'}`;
}

export function rememberedMiss(id: string, player: string): QuestionMiss | null {
  const miss = read()[slot(id, player)];
  if (!miss || typeof miss.cursor !== 'number' || typeof miss.index !== 'number') return null;
  return miss;
}

export function rememberMiss(id: string, player: string, miss: QuestionMiss) {
  const all = read();
  all[slot(id, player)] = miss;
  write(all);
}

export function forgetMiss(id: string, player: string) {
  const all = read();
  delete all[slot(id, player)];
  write(all);
}
