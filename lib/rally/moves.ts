import { ccc } from '@ckb-ccc/core';
import { BRAKE, encodeMoves, type RallyEvent } from '@/lib/rally/rules';

/**
 * Signed moves. Each phone signs its own car's moves with its session key while it drives, so the
 * finish needs nobody online: the relay sends it alone, and live-match checks each winner's moves
 * against that winner's key. Mirrors `MOVES_DOMAIN` and the signature check in live-match.
 */

export const MOVES_DOMAIN = 'crowns-rally-moves-1';
export const SIGNATURE_LEN = 65;
/** The furthest the relay may move a late input on, in ticks, before a phone won't sign it. */
export const MAX_LATE_TICKS = 100;

/** What a car's signature covers: `blake2b(MOVES_DOMAIN ‖ match id ‖ count ‖ events)`. */
export function movesHash(matchId: string, events: RallyEvent[]): ccc.Hex {
  return ccc.hashCkb(ccc.bytesFrom(MOVES_DOMAIN, 'utf8'), ccc.bytesFrom(matchId), encodeMoves(events));
}

/** The lock hash of the session key that signed these moves, or null if the signature is no good. */
export async function movesSigner(client: ccc.Client, matchId: string, events: RallyEvent[], signature: string): Promise<string | null> {
  try {
    if (ccc.bytesFrom(signature).length !== SIGNATURE_LEN) return null;
    const key = ccc.recoverMessageSecp256k1(movesHash(matchId, events), signature);
    return (await new ccc.SignerCkbPublicKey(client, key).getRecommendedAddressObj()).script.hash().toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Whether the relay's copy of this phone's car is made only of what the phone pressed: the same
 * inputs in the order sent, each on the tick asked for or a little later (the relay moves a late
 * input on to the next tick it hasn't played). The relay may drop an input, but never add one. A
 * brake on tick 0 is the relay holding the car on the line before its driver came.
 */
export function onlyWhatWasPressed(events: RallyEvent[], pressed: RallyEvent[]): boolean {
  let at = 0;
  for (const [i, event] of events.entries()) {
    if (i === 0 && event.tick === 0 && event.bits === BRAKE) continue;
    while (at < pressed.length && !(pressed[at]!.bits === event.bits && pressed[at]!.tick <= event.tick && event.tick - pressed[at]!.tick <= MAX_LATE_TICKS)) at += 1;
    if (at === pressed.length) return false;
    at += 1;
  }
  return true;
}

/** A phone's own car: what it pressed, and its signature over the relay's copy once that checks out. */
export class OwnMoves {
  private readonly pressed: RallyEvent[] = [];
  private signedHash: string | null = null;

  constructor(
    private readonly matchId: string,
    private readonly session: ccc.Hex,
  ) {}

  press(tick: number, bits: number) {
    this.pressed.push({ tick, bits });
  }

  /** A signature to send for the relay's copy of this car, or null if it hasn't changed or doesn't check out. */
  sign(events: RallyEvent[]): { count: number; signature: ccc.Hex } | null {
    const hash = movesHash(this.matchId, events);
    if (hash === this.signedHash || !onlyWhatWasPressed(events, this.pressed)) return null;
    this.signedHash = hash;
    // `r ‖ s ‖ recovery id`, as live-match reads it.
    return { count: events.length, signature: ccc.signMessageSecp256k1(hash, this.session) };
  }
}
