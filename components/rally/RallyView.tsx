'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ccc } from '@ckb-ccc/connector-react';
import Link from 'next/link';
import { ArrowLeft, Eye, Flag, Link2, Plus, Timer } from 'lucide-react';
import { CkbAmount, PlayerFace, usePlayerBook } from '@/components/crowns/Board';
import { lobbyEnd } from '@/components/crowns/OpenRaces';
import { ChainLoader } from '@/components/ui/ChainLoader';
import { RallyLive } from '@/components/rally/RallyLive';
import { RallyResults } from '@/components/rally/RallyResults';
import { Button } from '@/components/ui/Button';
import { useMyLockHash } from '@/hooks/useMyLockHash';
import { useWallet } from '@/hooks/useWallet';
import { getCkbClient } from '@/lib/ckb/client';
import { plainChainError } from '@/lib/ckb/errors';
import { newSessionKey, sessionKeyHash } from '@/lib/chain/session';
import { useTick } from '@/hooks/useTick';
import { CAR_COLORS } from '@/lib/rally/draw';
import { loadRallyKey, pendingKeys, rememberPendingKey, saveRallyKey } from '@/lib/rally/keys';
import { RallyLink } from '@/lib/rally/link';
import { findMatch, findSeats, joinMatch, matchEnding, mayGoHome, racingSeats, sendHome, type Seat } from '@/lib/rally/chain';
import { mapName } from '@/lib/rally/rules';
import { doorsOpen, LOBBY_MS } from '@/lib/rally/protocol';
import { MAP_IMG } from '@/lib/crowns/art';
import { rallyGame } from '@/lib/registry/config';

/** How long the page waits for something it sent to show on chain before showing the chain as it is. */
const SENT_WAIT_MS = 3 * 60_000;
/** When an entry was sent; read in click handlers only. */
const sentAt = () => Date.now();

function outPointKey(cell: ccc.Cell): string {
  return `${cell.outPoint.txHash}:${cell.outPoint.index}`;
}

const CKB = 100_000_000;
const noSubscribe = () => () => undefined;

function short(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Label({ children }: { children: string }) {
  return <p className="font-display text-sm font-extrabold uppercase tracking-wider text-fog">{children}</p>;
}

function homeError(cause: unknown): string {
  // The chain's clock (the median of recent blocks) runs a few minutes behind the wall clock.
  if (cause instanceof Error && /Immature/i.test(cause.message)) return 'Not yet: the chain’s clock runs a few minutes behind. Try again in a minute.';
  return plainChainError(cause, 'The entry could not be sent home.');
}

/** One match: join it, wait in its lobby, race it or watch it, and see how it ended. */
export function RallyView({ id }: { id: string }) {
  const signer = ccc.useSigner();
  const { isConnected } = useWallet();
  const queryClient = useQueryClient();
  const myLockHash = useMyLockHash()?.toLowerCase() ?? null;
  const [racing, setRacing] = useState(false);
  // A driver goes straight to the start line; one who steps out is brought back when the doors close.
  const [steppedOut, setSteppedOut] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Bumped when this browser saves a new play key, so it is read again.
  const [keyVersion, setKeyVersion] = useState(0);
  // What this page just sent and when: the chain takes a while to show it, so the page waits for it.
  const [sent, setSent] = useState<{ what: 'join' | 'home'; at: number; cell?: string } | null>(null);
  const session = useSyncExternalStore(
    noSubscribe,
    () => (keyVersion >= 0 ? loadRallyKey(id) : null),
    () => null,
  );
  const now = useTick(true, 1_000);
  const book = usePlayerBook();

  // When the chain first said there's no such match.
  const [firstMiss, setFirstMiss] = useState<number | null>(null);
  const match = useQuery({
    queryKey: ['match', id],
    queryFn: async () => {
      const found = await findMatch(getCkbClient(), id);
      if (found == null) setFirstMiss((at) => at ?? Date.now());
      return found;
    },
    refetchInterval: racing ? false : 4_000,
  });
  const ended = match.isSuccess && match.data == null;
  // A match opened a moment ago isn't on chain yet: keep looking for a while before calling it over.
  // Longer when this browser holds its play key, since then it was hosted or joined from here.
  const landing = ended && (firstMiss == null || now - firstMiss < (session ? 5 : 1) * 60_000);
  const ending = useQuery({
    queryKey: ['match-ending', id],
    queryFn: () => matchEnding(getCkbClient(), id),
    enabled: ended,
    refetchInterval: 10_000,
  });
  // Seats outlive their match when they never raced: their owners still need to send them home.
  const leftover = useQuery({
    queryKey: ['match-seats', id],
    queryFn: () => findSeats(getCkbClient(), id as ccc.Hex),
    enabled: ended,
    refetchInterval: 10_000,
  });
  const refresh = useCallback(() => {
    for (const key of ['match', 'match-ending', 'match-seats']) void queryClient.invalidateQueries({ queryKey: [key, id] });
  }, [queryClient, id]);

  const snapshot = match.data ?? null;
  const cell = snapshot?.match;
  const racers = useMemo(() => (snapshot ? racingSeats(snapshot) : []), [snapshot]);
  const players = useMemo(() => (cell ? [cell.host.toLowerCase(), ...racers.map((seat) => seat.owner.toLowerCase())] : []), [cell, racers]);
  const iAmHost = Boolean(myLockHash && cell && myLockHash === cell.host.toLowerCase());
  const iAmIn = Boolean(myLockHash && players.includes(myLockHash));
  const full = Boolean(cell && players.length >= cell.seats);
  const confirming = Boolean(snapshot?.seats.some((seat) => !seat.landed && seat.owner.toLowerCase() === myLockHash));
  const mySeats = (ended ? (leftover.data ?? []) : (snapshot?.seats ?? [])).filter((seat) => seat.owner.toLowerCase() === myLockHash);
  const hostCanGoHome = Boolean(iAmHost && snapshot && mayGoHome(snapshot.landed?.landedMs, now, snapshot.match.wait));
  // Our seat was sent but the chain doesn't show it yet; our entry was sent home but the cell's still there.
  const fresh = sent != null && now - sent.at < SENT_WAIT_MS;
  const seatLanding = fresh && sent?.what === 'join' && !iAmIn && !confirming;
  const sentHome = fresh && sent?.what === 'home';
  const goingHome = sentHome && [snapshot?.cell, ...(snapshot?.seats ?? []).map((seat) => seat.cell), ...(leftover.data ?? []).map((seat) => seat.cell)].some((c) => c && outPointKey(c) === sent?.cell);
  // A match opened on a game this site has since replaced: the match script can't call that game any
  // more, so it can't be raced, only sent home.
  const retired = Boolean(cell && cell.game.toLowerCase() !== rallyGame.codeHash.toLowerCase());

  // The wallet approved but the page never heard back (closed popup, reload): the play key is still
  // set aside here as pending. Find it by the key the match or our seat recorded, and keep it.
  const myKeys = useMemo(
    () => (cell && iAmIn ? [...(iAmHost ? [cell.hostKey] : []), ...racers.filter((seat) => seat.owner.toLowerCase() === myLockHash).map((seat) => seat.key)].map((key) => key.toLowerCase()) : []),
    [cell, iAmIn, iAmHost, racers, myLockHash],
  );
  useQuery({
    queryKey: ['recover-key', id, myKeys],
    queryFn: async () => {
      for (const secret of pendingKeys()) {
        if (myKeys.includes((await sessionKeyHash(getCkbClient(), secret)).toLowerCase())) {
          saveRallyKey(id, secret);
          setKeyVersion((version) => version + 1);
          return true;
        }
      }
      return false;
    },
    enabled: myKeys.length > 0 && !session,
  });

  const nameOf = useCallback(
    (key: string) => {
      if (!cell) return 'Car';
      const car = [cell.hostKey, ...racers.map((seat) => seat.key)].findIndex((k) => k.toLowerCase() === key.toLowerCase());
      const owner = car >= 0 ? players[car] : null;
      if (owner && owner === myLockHash) return 'You';
      return car === 0 ? 'Host' : car > 0 ? `Player ${car + 1}` : 'Car';
    },
    [cell, racers, players, myLockHash],
  );

  async function join() {
    if (!signer || !snapshot) return;
    setError(null);
    try {
      setBusy('Preparing your seat…');
      const key = await newSessionKey(getCkbClient());
      rememberPendingKey(key.secret);
      setBusy('Approve in your wallet to put your entry in the pot…');
      await joinMatch(signer, snapshot, key);
      saveRallyKey(id, key.secret);
      setKeyVersion((v) => v + 1);
      setSent({ what: 'join', at: Date.now() });
      refresh();
    } catch (cause) {
      setError(plainChainError(cause, 'You could not join this match.'));
    } finally {
      setBusy(null);
    }
  }

  async function closeLobby() {
    setError(null);
    try {
      setBusy('Sending your entry home…');
      await new RallyLink(id, () => undefined, () => undefined).closeLobby();
      setSent({ what: 'home', at: Date.now(), cell: snapshot ? outPointKey(snapshot.cell) : undefined });
      refresh();
    } catch (cause) {
      setError(plainChainError(cause, 'The match could not be closed.'));
    } finally {
      setBusy(null);
    }
  }

  async function goHome(target: { cell: ccc.Cell; owner: string; wait: number }) {
    setError(null);
    try {
      setBusy('Sending your entry home…');
      await sendHome(getCkbClient(), target.cell, target.owner, target.wait);
      setSent({ what: 'home', at: sentAt(), cell: outPointKey(target.cell) });
      refresh();
    } catch (cause) {
      setError(homeError(cause));
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      // No clipboard: the address bar has the link.
    }
  }

  const ends = snapshot ? lobbyEnd(snapshot) : null;
  const left = ends == null ? null : Math.max(0, ends - now);
  // Every driver waits on the start line, connected, so the whole field starts on the same tick.
  const driving = Boolean(iAmIn && session && !retired);
  const nearStart = left != null && left > 0 && !doorsOpen(ends!, now);

  if ((racing || (driving && (!steppedOut || nearStart))) && snapshot?.landed) {
    return (
      <RallyLive
        snapshot={snapshot}
        session={iAmIn ? session : null}
        nameOf={nameOf}
        onLeave={() => {
          setRacing(false);
          setSteppedOut(true);
          refresh();
        }}
        onEnded={refresh}
      />
    );
  }

  const homeButtons = mySeats.map((seat: Seat) =>
    mayGoHome(seat.landed?.landedMs, now, seat.wait) ? (
      <Button key={seat.cell.outPoint.txHash} variant="ghost" block onClick={() => void goHome({ cell: seat.cell, owner: seat.owner, wait: seat.wait })} disabled={Boolean(busy)}>
        Send my entry home ({Number(seat.cell.cellOutput.capacity) / CKB} CKB)
      </Button>
    ) : null,
  );
  const backLink = (
    <Link href="/rally" className="inline-flex h-10 items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-fog hover:text-chalk">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Races
    </Link>
  );

  const overlay = busy ? (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/85 px-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-ink-2 px-6 py-10">
        <ChainLoader inline={false} compact title={busy} />
      </div>
    </div>
  ) : null;

  if (match.isPending || ((landing || sentHome) && !ending.data && (leftover.data ?? []).length === 0)) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-5 pt-6 sm:px-8">
        {backLink}
        {match.isPending ? (
          <ChainLoader title="Reading the race from the chain…" />
        ) : sentHome ? (
          <ChainLoader title="Sending your entry home…" note="It shows in your wallet within a minute." />
        ) : (
          <ChainLoader title="Waiting for the race to land on chain…" note="A new race shows up within a minute. Your entry stays in your own cell until the race locks." />
        )}
        {overlay}
      </div>
    );
  }

  if (!snapshot || !cell) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-5 pt-6 sm:px-8">
        {backLink}
        {ending.data ? (
          <RallyResults txHash={ending.data.txHash} me={myLockHash} />
        ) : (
          <section className="mt-6 rounded-3xl border border-dashed border-line px-6 py-14 text-center">
            <p className="font-display text-4xl font-black uppercase">{ending.isPending ? 'Looking up how it ended…' : 'No race here'}</p>
            {ending.isPending ? null : <p className="mt-2 text-fog">That race doesn’t exist, or the link is wrong.</p>}
          </section>
        )}
        {mySeats.length > 0 && goingHome ? (
          <div className="mt-6">
            <ChainLoader compact title="Sending your entry home…" />
          </div>
        ) : mySeats.length > 0 ? (
          <div className="mx-auto mt-8 max-w-md space-y-3">
            <p className="text-gold">Your seat didn’t race, so your entry is still yours. It can go home once its race could have ended: 10 minutes after the lobby’s wait.</p>
            {homeButtons}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 text-danger">
            {error}
          </p>
        ) : null}
        {overlay}
      </div>
    );
  }

  return (
    <div>
      <section className="relative isolate h-[300px] overflow-hidden sm:h-[420px] lg:h-[480px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MAP_IMG[cell.map]} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
        <div className="mx-auto flex h-full max-w-[1440px] flex-col justify-between px-5 pb-6 pt-4 sm:px-8 sm:pb-10">
          {backLink}
          <div>
            <p className="font-display text-lg font-extrabold uppercase text-lime">{cell.seats} seats · 3 laps · live</p>
            <h1 className="font-display text-[56px] font-black uppercase leading-[0.85] sm:text-[96px]">{mapName(cell.map)}</h1>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1.4fr_1fr] lg:gap-14">
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-3xl font-black uppercase">Seats</h2>
            <span className="font-display text-2xl font-black tabular-nums">
              {players.length}/{cell.seats}
            </span>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: cell.seats }, (_, car) => {
              const owner = players[car];
              const player = owner ? book.get(owner) : undefined;
              return (
                <li key={car}>
                  {owner ? (
                    <div className="flex items-center gap-4 rounded-2xl border border-line bg-ink-2 p-3">
                      <PlayerFace player={player} fallback={owner} size={52} tone={CAR_COLORS[car]} />
                      <div className="min-w-0">
                        <p className="truncate font-display text-2xl font-black leading-none">{owner === myLockHash ? 'You' : player ? `@${player.username}` : short(owner)}</p>
                        <p className="mt-1 text-sm text-fog">{car === 0 ? 'Host · ' : ''}Entry in</p>
                      </div>
                      <span className="ml-auto font-display text-lg font-black" style={{ color: CAR_COLORS[car] }}>
                        #{car + 1}
                      </span>
                    </div>
                  ) : (
                    <div className="flex h-[78px] items-center gap-4 rounded-2xl border-2 border-dashed border-line p-3 text-fog">
                      <span className="grid h-[52px] w-[52px] place-items-center rounded-full bg-ink-2">
                        <Plus className="h-6 w-6" aria-hidden="true" />
                      </span>
                      <span className="font-display text-2xl font-black uppercase">Open seat</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-3xl border border-line bg-ink-2 p-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <Label>Pot so far</Label>
                <p className="mt-1 font-display text-6xl font-black leading-none text-gold">
                  <CkbAmount value={(Number(cell.entry) * players.length) / CKB} />
                </p>
              </div>
              <div className="text-right">
                <Label>Entry</Label>
                <p className="mt-1 font-display text-3xl font-black leading-none">
                  <CkbAmount value={Number(cell.entry) / CKB} />
                </p>
              </div>
            </div>

            {left != null && !retired ? (
              <div className="mt-6 border-t border-line pt-5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-display text-lg font-extrabold uppercase">
                    <Timer className="h-5 w-5 text-lime" aria-hidden="true" /> {left > 0 ? 'Starts in' : 'Starting'}
                  </span>
                  <span className={`font-display text-4xl font-black tabular-nums ${left < 30_000 ? 'text-pink' : ''}`}>{clock(left)}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-3">
                  <div className="h-full rounded-full bg-lime transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (left / (cell.wait ? cell.wait * 1000 : LOBBY_MS)) * 100)}%` }} />
                </div>
                <p className="mt-2 text-sm text-fog">Starts when the clock runs out, at once when every seat is full, or when the host starts it. Each player who joins takes a fifth off the time left, down to 2 minutes.</p>
              </div>
            ) : null}

            <div className="mt-6 space-y-3">
              {!snapshot.landed ? (
                <ChainLoader compact title="The race is confirming…" />
              ) : goingHome ? (
                <ChainLoader compact title="Sending your entry home…" />
              ) : (
                <>
                  {retired ? (
                    <p className="rounded-2xl bg-gold/10 p-4 text-gold">
                      This race was opened on an older version of the game, which has since been replaced, so it can’t be raced. Every entry can go home 10 minutes after the lobby’s wait.
                    </p>
                  ) : iAmIn && session ? (
                    <p className="flex items-start gap-3 rounded-2xl bg-lime/10 p-4 text-lime">
                      <Flag className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> You’re in. A minute before the start you’re put back on the start line, so everyone starts together.
                    </p>
                  ) : iAmIn ? (
                    <p className="rounded-2xl bg-gold/10 p-4 text-gold">
                      This browser doesn’t have this race’s play key, so it can’t drive here. Open the race in the browser you entered from, or close it below to take your entry back.
                    </p>
                  ) : confirming || seatLanding ? (
                    <ChainLoader compact title="Your seat is landing on chain…" note="Your entry is going into your own cell." />
                  ) : !full && ends != null && !doorsOpen(ends, now) ? (
                    <p className="text-fog">The doors have closed: this race starts within a minute. Watch it, or open your own.</p>
                  ) : !full ? (
                    <Button variant="lime" size="xl" block onClick={() => void join()} disabled={Boolean(busy) || !isConnected}>
                      {isConnected ? `Join – put ${Number(cell.entry) / CKB} CKB in the pot` : 'Connect your wallet to join'}
                    </Button>
                  ) : (
                    <p className="text-fog">This race is full.</p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="ghost" block onClick={() => void share()}>
                      <Link2 className="h-5 w-5" aria-hidden="true" /> {copied ? 'Copied' : 'Share link'}
                    </Button>
                    {retired ? null : (
                      <Button variant="ghost" block onClick={() => setRacing(true)}>
                        <Eye className="h-5 w-5" aria-hidden="true" /> Watch
                      </Button>
                    )}
                  </div>
                  {iAmHost && players.length === 1 && !hostCanGoHome ? (
                    <Button variant="ghost" block onClick={() => void closeLobby()} disabled={Boolean(busy)}>
                      Nobody’s here: close and take my entry back
                    </Button>
                  ) : null}
                  {hostCanGoHome ? (
                    <Button variant="ghost" block onClick={() => void goHome({ cell: snapshot.cell, owner: cell.host, wait: cell.wait })} disabled={Boolean(busy)}>
                      Something went wrong: send my entry home
                    </Button>
                  ) : null}
                  {homeButtons}
                </>
              )}
            </div>
            {error ? (
              <p role="alert" className="mt-4 text-danger">
                {error}
              </p>
            ) : null}
          </div>
          <p className="mt-4 px-2 text-sm text-fog">If nobody joins or nobody finishes, every entry goes back home.</p>
        </aside>
      </div>
      {overlay}
    </div>
  );
}
