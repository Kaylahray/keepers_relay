import { ckbWhole, GAMES, roomFromStored } from '@/lib/crown/rooms';
import { getBuilder } from '@/lib/server/builders-store';
import { publicRoom, readVault } from '@/lib/server/crowns-store';
import { chainUsernameOfLockHash } from '@/lib/server/username-registry';

export type CrownPreview = {
  title: string;
  game: string;
  pot: string;
  fee: string;
  toBeat: number;
  /** "6 min left", "Lobby open", "Time up" or "Closed". */
  clock: string;
  host: string | null;
  /** The card's headline: the challenge in one line. */
  headline: string;
  /** The card's one sentence. */
  description: string;
  /** The match is over or out of time, so the score is the winning one, not one to beat. */
  finished: boolean;
};

function clockWords(ms: number): string {
  if (ms <= 0) return 'Time up';
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min left`;
}

/**
 * What a shared crown link says about itself. Read from the stored room only, never the chain:
 * link previews are fetched by chat apps that give up after a few seconds. The stored room is
 * kept in step with the chain whenever anyone has the crown open.
 */
export async function crownPreview(id: string): Promise<CrownPreview | null> {
  const vault = await readVault(id).catch(() => null);
  if (!vault) return null;
  const room = publicRoom(roomFromStored(vault.room));
  const host = vault.hostAddress ? await getBuilder(vault.hostAddress).catch(() => null) : null;
  const hostName = host?.username || null;
  // Chat apps give up on slow previews, so the chain lookup gets two seconds at most.
  const kingName = room.kingHash
    ? await Promise.race([
        chainUsernameOfLockHash(room.kingHash).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_000)),
      ])
    : null;
  const king = kingName ? `@${kingName}` : room.king;
  const game = GAMES[room.game]?.title ?? 'Lane Runner';
  const pot = ckbWhole(room.potShannons);
  const fee = ckbWhole(room.feeShannons);
  const clock =
    room.status === 'settled'
      ? 'Closed'
      : room.status === 'lobby'
        ? 'Lobby open'
        : room.deadlineAt != null
          ? clockWords(room.deadlineAt - Date.now())
          : 'Live';
  const headline =
    room.status === 'settled'
      ? king
        ? `${king} took the crown with ${room.kingScore}`
        : 'This crown is closed'
      : room.status === 'lobby'
        ? 'Join the lobby before the clock starts'
        : clock === 'Time up'
        ? king
          ? `${king} holds the crown at zero`
          : 'Time ran out with the crown open'
        : room.kingScore > 0
          ? `Beat ${room.kingScore} to take the crown`
          : 'The crown is open. Take it.';
  const by = hostName ? ` · hosted by @${hostName}` : '';
  const description =
    room.status === 'settled' || clock === 'Time up'
      ? `${game} · ${pot} CKB pot · ${clock}${by}.`
      : `${game} · pot ${pot} CKB · ${fee} CKB entry · ${clock}${by}. Practise free, then beat the score.`;
  return { title: room.title, game, pot, fee, toBeat: room.kingScore, clock, host: hostName, headline, description, finished: room.status === 'settled' || clock === 'Time up' };
}
