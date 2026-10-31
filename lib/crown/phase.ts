/**
 * The entry window: what the extra minutes on the opening deadline actually are.
 *
 * The match cell's deadline is written the moment the host presses Start, but nothing can happen
 * until that cell confirms (a few blocks), and nobody can lock an entry until it has, and an
 * entry is itself a transaction that has to confirm before it can be spent in a steal. None of
 * that waiting is the host's fault, so the opening deadline carries a pad on top of the clock
 * they chose.
 *
 * Left unexplained that pad looks like a bug: the host sets 30 minutes and the clock reads 32:40,
 * and the number is different every match because it depends on how slow the chain was.
 *
 * Explained, it is a phase. The pad is a fixed block of time at the front of the match in which
 * players lock their entries. It ends at `deadline - duration`, and from that moment the clock
 * reads exactly what the host set. Everyone derives the same moment from the same cell, so the
 * round starts for the whole lobby at once and no extra data goes on chain.
 *
 * Pure, with no imports, so the server can use it without dragging the wallet connector in.
 */

/** Written onto the opening deadline on top of the host's clock. */
export const CONFIRM_PAD_MS = 3 * 60 * 1000;

/**
 * The shortest entry window. The pad is counted from when the host's transaction was built, so the
 * time they spend approving it comes out of the pad; below this floor, it comes off the game clock.
 */
export const MIN_ENTRY_MS = 2 * 60 * 1000;

export type PhaseRoom = {
  matchId: string | null;
  deadlineAt: number | null;
  durationMs: number;
  openedAt: number | null;
  round: number;
  king: string | null;
  potShannons: bigint;
};

/**
 * When round one begins, or null when this match has no entry window.
 *
 * There is only ever one: before the first crown is taken. After that the clock is the cell's
 * deadline and nothing else. Crowns opened before the pad existed also return null, which is
 * what keeps them working: their deadline minus their duration lands at or before the moment
 * they were opened, so there is no window to wait out.
 */
export function gameStartAt(room: PhaseRoom): number | null {
  if (!room.matchId || room.deadlineAt == null || room.openedAt == null) return null;
  if (room.round > 1 || room.king || room.potShannons > 0n) return null;
  const planned = room.deadlineAt - room.durationMs;
  // `openedAt` is stamped after the wallet approves, so the lead is the pad minus that approval.
  if (planned - room.openedAt > CONFIRM_PAD_MS) return null;
  // Every screen derives the same moment from the same shared `openedAt`.
  const start = Math.max(planned, room.openedAt + MIN_ENTRY_MS);
  return start < room.deadlineAt ? start : null;
}

/** True while players are locking entries and the first question is not yet open. */
export function inEntryWindow(room: PhaseRoom, now: number): boolean {
  const start = gameStartAt(room);
  return start != null && now < start;
}
