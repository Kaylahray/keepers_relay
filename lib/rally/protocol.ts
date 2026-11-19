/**
 * What phones and the rally relay say to each other. Phones post to the relay (join, input, moves)
 * and listen on one event stream per match, which anyone may open to watch.
 *
 * The lobby is on chain: the host's match cell and a seat cell per player. It waits as long as the
 * host picked from the match landing, less a cut for each player who joins (see `lobbyEndsAt`). The
 * race starts only when that clock runs out, full or not, with whoever has a seat, if that is two or
 * more: every driver's phone goes to the race at the same moment.
 *
 * The relay keeps the race clock. A phone asks for its input to start on a tick a little ahead of
 * now; the relay takes it on that tick, or on the next tick it has not played yet if the input came
 * late. Every tick the relay has played is final: phones and the chain replay the same events.
 *
 * Each phone signs its own car's moves as the relay passes them back, once it has checked they are
 * only what it pressed, and posts the signature. When the race ends the relay sends the finish
 * alone: nobody has to be online for it, and the chain pays only a winner whose moves are signed.
 */

/** What a phone signs with its session key to join: proves it holds the key of a car in the match. */
export function joinMessage(matchId: string, nonce: number): string {
  return `crowns-rally:${matchId.toLowerCase()}:${nonce}`;
}

export type JoinRequest = {
  matchId: string;
  /** Milliseconds since 1970; the relay refuses a join signed more than five minutes away from its clock. */
  nonce: number;
  signature: { signature: string; identity: string; signType: string };
};

export type JoinReply = { token: string };

export type InputRequest = { matchId: string; token: string; tick: number; bits: number };

/** This phone's signature over its car's first `count` events, as the relay passed them back. */
export type MovesRequest = { matchId: string; token: string; count: number; signature: string };

/** Asks the relay to close a lobby nobody joined, so the host's entry goes home now. */
export type CloseRequest = { matchId: string };

/** `settling`: the race is over and the relay is sending the finish. */
export type RallyPhase = 'lobby' | 'countdown' | 'racing' | 'settling' | 'done' | 'failed';

/** `car, tick, bits`: from that tick on, the car holds those inputs. Replaces the car's last event if the tick is the same. */
export type WireEvent = [number, number, number];

export type RelayMessage =
  | {
      type: 'state';
      phase: RallyPhase;
      /** When the lobby closes, on the relay's clock (ms since 1970). */
      lobbyEndsAt: number | null;
      /** When tick 0 starts. */
      startAt: number | null;
      /** The relay's clock when it sent this, so phones can line their clocks up with it. */
      now: number;
      map: number;
      /** Each car's session key lock hash, host first. Empty until the countdown. */
      cars: string[];
      /** The key lock hashes of the phones connected now. */
      joined: string[];
      note?: string;
      txHash?: string;
    }
  /** Every tick below `t` is final. `ev` holds the events new since the last message. */
  | { type: 'tick'; t: number; ev: WireEvent[] };

/** How far ahead of the relay's last played tick a phone may schedule an input. */
export const MAX_AHEAD_TICKS = 40;
/** How far ahead phones schedule inputs, so most land on the tick they asked for. */
export const INPUT_DELAY_TICKS = 3;
/** Between the lobby closing and tick 0. */
export const COUNTDOWN_MS = 10_000;
/** The wait of a match opened before hosts picked one. */
export const LOBBY_MS = 2 * 60_000;
/** The waits a host may pick, in minutes. The chain allows 1 to 60. */
export const WAIT_CHOICES = [5, 10, 15, 30, 60] as const;
/** Each player who joins takes this share off the time left... */
export const JOIN_CUT = 0.2;
/** ...but never brings it below this. */
export const CUT_FLOOR_MS = 2 * 60_000;
/** Nobody may join in the last minute, so a seat never lands after its lobby has closed. */
export const DOORS_MS = 60_000;
/** The lobby stays open at least this long after the last seat lands, so its driver can get in. */
export const LAST_CALL_MS = 20_000;

/**
 * When a lobby closes, and the race starts: the only way it does. It starts as the host's wait from
 * the match landing; each seat, as it lands, takes `JOIN_CUT` of the time then left, never below
 * `CUT_FLOOR_MS`. It never closes before the last driver has had time to connect. A full lobby waits
 * out its clock like any other, so every driver knows when the race starts. `waitMs` is 0 for a match
 * from before hosts picked one, which waits `LOBBY_MS` with no cuts.
 */
export function lobbyEndsAt(matchLandedMs: number, seatLandedMs: number[], waitMs: number): number {
  const lastCall = seatLandedMs.length > 0 ? Math.max(...seatLandedMs) + LAST_CALL_MS : 0;
  if (waitMs <= 0) return Math.max(matchLandedMs + LOBBY_MS, lastCall);
  let ends = matchLandedMs + waitMs;
  for (const landed of [...seatLandedMs].sort((a, b) => a - b)) {
    const left = ends - landed;
    if (left > CUT_FLOOR_MS) ends = landed + Math.max(CUT_FLOOR_MS, Math.round(left * (1 - JOIN_CUT)));
  }
  return Math.max(ends, lastCall);
}

/** Whether a lobby closing at `endsAt` still lets players in. */
export function doorsOpen(endsAt: number, nowMs: number): boolean {
  return nowMs < endsAt - DOORS_MS;
}
