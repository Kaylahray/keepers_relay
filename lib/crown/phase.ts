/** The entry window: what the extra minutes on the opening deadline actually are. */

/** The countdown after the host approves the start. Also written onto the opening deadline on top of the host's clock. */
export const CONFIRM_PAD_MS = 3 * 60 * 1000;

export type PhaseRoom = {
  matchId: string | null;
  deadlineAt: number | null;
  durationMs: number;
  openedAt: number | null;
  round: number;
  king: string | null;
  potShannons: bigint;
};

/** When round one begins, or null when this match has no entry window. */
export function gameStartAt(room: PhaseRoom): number | null {
  if (!room.matchId || room.deadlineAt == null || room.openedAt == null) return null;
  if (room.round > 1 || room.king || room.potShannons > 0n) return null;
  const planned = room.deadlineAt - room.durationMs;
  if (planned - room.openedAt > CONFIRM_PAD_MS) return null;
  // The full countdown runs from the approval (`openedAt`); the time spent approving comes off the clock instead.
  const start = room.openedAt + CONFIRM_PAD_MS;
  return start < room.deadlineAt ? start : null;
}

/** True while players are locking entries and the first question is not yet open. */
export function inEntryWindow(room: PhaseRoom, now: number): boolean {
  const start = gameStartAt(room);
  return start != null && now < start;
}
