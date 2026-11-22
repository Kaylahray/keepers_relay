'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ccc } from '@ckb-ccc/connector-react';
import Link from 'next/link';
import { ArrowLeft, AtSign, Eye, Link2, Plus, Star, Timer } from 'lucide-react';
import { CkbAmount, PlayerFace, usePlayerBook } from '@/components/crowns/Board';
import { lobbyEnd } from '@/components/crowns/OpenRaces';
import { ChainLoader } from '@/components/ui/ChainLoader';
import { RallyLive } from '@/components/rally/RallyLive';
import { RallyResults } from '@/components/rally/RallyResults';
import { Button, buttonClass } from '@/components/ui/Button';
import { useMyLockHash } from '@/hooks/useMyLockHash';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';
import { getCkbClient } from '@/lib/ckb/client';
import { plainChainError } from '@/lib/ckb/errors';
import { newSessionKey, sessionKeyHash } from '@/lib/chain/session';
import { useTick } from '@/hooks/useTick';
import { CAR_COLORS } from '@/lib/rally/draw';
import { loadRallyKey, pendingKeys, rememberPendingKey, saveRallyKey } from '@/lib/rally/keys';
import { RallyLink } from '@/lib/rally/link';
import { findMatch, findSeats, isSponsored, joinMatch, matchEnding, mayGoHome, needsPass, playersOf, potOf, racingSeats, seatDeposit, sendHome, type Seat } from '@/lib/rally/chain';
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
  if (cause instanceof Error && /Immature/i.test(cause.message)) return 'Not quite yet. Try again in a minute.';
  return plainChainError(cause, 'The entry could not be sent home.');
}

/** One match: join it, wait in its lobby, race it or watch it, and see how it ended. */
export function RallyView({ id }: { id: string }) {
  const signer = ccc.useSigner();
  const { isConnected } = useWallet();
  const queryClient = useQueryClient();
  const myLockHash = useMyLockHash()?.toLowerCase() ?? null;
  const [racing, setRacing] = useState(false);
  // Set when this driver leaves the race screen, so the lobby doesn't send them straight back in.
  const [leftRace, setLeftRace] = useState(false);
  // Set when the race screen saw the payout: the chain still shows the lobby for a moment after.
  const [paidOut, setPaidOut] = useState(false);
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
  const username = useUsername();

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
  // Each car, the host first if they race: who it pays and which key drives it.
  const cars = useMemo(() => (snapshot ? playersOf(snapshot, racers) : []), [snapshot, racers]);
  const players = useMemo(() => cars.map((car) => car.owner.toLowerCase()), [cars]);
  const iAmHost = Boolean(myLockHash && cell && myLockHash === cell.host.toLowerCase());
  const iAmIn = Boolean(myLockHash && players.includes(myLockHash));
  // A host who only sponsors watches their race.
  const iAmSponsor = Boolean(iAmHost && cell && !cell.hostRaces);
  const free = Boolean(cell && isSponsored(cell));
  // A race open only to players with a username, and this wallet has none yet.
  const needsName = Boolean(cell && needsPass(cell) && isConnected && username.registryReady && !username.isLoading && !username.username);
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

  // A driver waits in the lobby, but already joined at the relay, so it shows them as here. When the
  // clock runs out the relay starts the countdown, and every driver's page goes to the race at once
  // and sees the same 10 → Go.
  const driver = Boolean(iAmIn && session && !retired && snapshot?.landed);
  useEffect(() => {
    if (!driver || racing || !session) return;
    const link = new RallyLink(
      id,
      (message) => {
        if (message.type !== 'state') return;
        if (!leftRace && (message.phase === 'countdown' || message.phase === 'racing')) setRacing(true);
      },
      () => undefined,
    );
    link.listen();
    void link.join(getCkbClient(), session).catch(() => undefined);
    return () => link.close();
  }, [driver, racing, leftRace, session, id]);

  // The wallet approved but the page never heard back (closed popup, reload): the play key is still
  // set aside here as pending. Find it by the key the match or our seat recorded, and keep it.
  const myKeys = useMemo(
    () => (cell && iAmIn ? [...(iAmHost && cell.hostRaces ? [cell.hostKey] : []), ...racers.filter((seat) => seat.owner.toLowerCase() === myLockHash).map((seat) => seat.key)].map((key) => key.toLowerCase()) : []),
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
      const car = cars.findIndex((c) => c.key.toLowerCase() === key.toLowerCase());
      const owner = car >= 0 ? players[car] : null;
      if (owner && owner === myLockHash) return 'You';
      return car === 0 && cell.hostRaces ? 'Host' : car >= 0 ? `Player ${car + 1}` : 'Car';
    },
    [cell, cars, players, myLockHash],
  );

  async function join() {
    if (!signer || !snapshot) return;
    setError(null);
    try {
      setBusy('Preparing your seat…');
      const key = await newSessionKey(getCkbClient());
      rememberPendingKey(key.secret);
      setBusy(free ? 'Confirm your seat…' : 'Confirm your entry fee…');
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
      setBusy('Getting your money back…');
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
      setBusy('Getting your money back…');
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

  if (racing && snapshot?.landed) {
    return (
      <RallyLive
        snapshot={snapshot}
        session={iAmIn ? session : null}
        nameOf={nameOf}
        onLeave={() => {
          setRacing(false);
          setLeftRace(true);
          refresh();
        }}
        onEnded={(paid) => {
          if (paid) setPaidOut(true);
          refresh();
        }}
      />
    );
  }

  const homeButtons = mySeats.map((seat: Seat) =>
    mayGoHome(seat.landed?.landedMs, now, seat.wait) ? (
      <Button key={seat.cell.outPoint.txHash} variant="ghost" block onClick={() => void goHome({ cell: seat.cell, owner: seat.owner, wait: seat.wait })} disabled={Boolean(busy)}>
        Get my money back ({Number(seat.cell.cellOutput.capacity) / CKB} CKB)
      </Button>
    ) : null,
  );
  const ends = snapshot ? lobbyEnd(snapshot) : null;
  const sponsor = cell ? book.get(cell.host.toLowerCase()) : undefined;
  const sponsorName = cell && myLockHash === cell.host.toLowerCase() ? 'you' : sponsor ? `@${sponsor.username}` : cell ? short(cell.host) : '';
  const left = ends == null ? null : Math.max(0, ends - now);

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

  // After a payout the chain shows the old lobby until the finish is indexed: wait for the result instead.
  const awaitingResult = paidOut && (snapshot != null || !ending.data);
  if (match.isPending || awaitingResult || ((landing || sentHome) && !ending.data && (leftover.data ?? []).length === 0)) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-5 pt-6 sm:px-8">
        {backLink}
        {awaitingResult ? (
          <ChainLoader title="Loading the result…" note="The chain paid out. The result shows here in a moment." />
        ) : match.isPending ? (
          <ChainLoader title="Loading the race…" />
        ) : sentHome ? (
          <ChainLoader title="Getting your money back…" note="It’s back in your account within a minute." />
        ) : (
          <ChainLoader title="Setting up your race…" note="A new race shows up within a minute. Your money stays yours until the race starts." />
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
            <ChainLoader compact title="Getting your money back…" />
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
            {free ? (
              <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1 font-display text-sm font-black uppercase tracking-wider text-ink">
                <Star className="h-4 w-4" aria-hidden="true" /> Free entry · sponsored by {sponsorName}
              </p>
            ) : null}
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
                        <p className="mt-1 text-sm text-fog">
                          {car === 0 && cell.hostRaces ? 'Host · ' : ''}
                          {free ? 'Joined free' : 'Entry in'}
                        </p>
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
                <Label>{free ? 'Prize' : 'Pot so far'}</Label>
                <p className="mt-1 font-display text-6xl font-black leading-none text-gold">
                  <CkbAmount value={Number(potOf(cell, players.length)) / CKB} />
                </p>
              </div>
              <div className="text-right">
                <Label>Entry</Label>
                <p className="mt-1 font-display text-3xl font-black leading-none">{free ? 'Free' : <CkbAmount value={Number(cell.entry) / CKB} />}</p>
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
                <p className="mt-2 text-sm text-fog">Starts for everyone at once when the clock runs out, even if every seat is full. Each player who joins takes a fifth off the time left, down to 2 minutes.</p>
              </div>
            ) : null}

            <div className="mt-6 space-y-3">
              {!snapshot.landed ? (
                <ChainLoader compact title="The race is confirming…" />
              ) : goingHome ? (
                <ChainLoader compact title="Getting your money back…" />
              ) : (
                <>
                  {retired ? (
                    <p className="rounded-2xl bg-gold/10 p-4 text-gold">
                      This race was opened on an older version of the game, which has since been replaced, so it can’t be raced. Every entry can go home 10 minutes after the lobby’s wait.
                    </p>
                  ) : iAmSponsor ? (
                    <p className="rounded-2xl bg-gold/10 p-4 text-gold">You’re sponsoring this race. Share the link, then watch it live when the clock runs out.</p>
                  ) : iAmIn && session ? null : iAmIn ? (
                    <p className="rounded-2xl bg-gold/10 p-4 text-gold">
                      This browser doesn’t have this race’s play key, so it can’t drive here. Open the race in the browser you entered from, or close it below to take your entry back.
                    </p>
                  ) : confirming || seatLanding ? (
                    <ChainLoader compact title="Saving your seat…" note="Your entry is locked in safely." />
                  ) : !full && ends != null && !doorsOpen(ends, now) ? (
                    <p className="text-fog">The doors have closed: this race starts within a minute. Watch it, or open your own.</p>
                  ) : !full && needsName ? (
                    <>
                      <p className="text-fog">This race is open to players with a username.</p>
                      <Link href={`/join?next=/rally/${id}`} className={buttonClass('lime', 'xl', true)}>
                        <AtSign className="h-5 w-5" aria-hidden="true" /> Pick your name first
                      </Link>
                    </>
                  ) : !full ? (
                    <>
                      {free ? (
                        <p className="text-sm text-fog">
                          Free to join. You lock a <b className="text-chalk">{Math.ceil(Number(seatDeposit(snapshot.matchId)) / CKB)} CKB</b> deposit for your seat, and it all comes back after the race.
                        </p>
                      ) : null}
                      <Button variant="lime" size="xl" block onClick={() => void join()} disabled={Boolean(busy) || !isConnected}>
                        {!isConnected ? 'Sign in to join' : free ? 'Join free' : `Join – put ${Number(cell.entry) / CKB} CKB in the pot`}
                      </Button>
                    </>
                  ) : (
                    <p className="text-fog">This race is full.</p>
                  )}
                  <div className={`grid gap-3 ${retired || (iAmIn && session) ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    <Button variant="ghost" block onClick={() => void share()}>
                      <Link2 className="h-5 w-5" aria-hidden="true" /> {copied ? 'Copied' : 'Share link'}
                    </Button>
                    {retired || (iAmIn && session) ? null : (
                      <Button variant="ghost" block onClick={() => setRacing(true)}>
                        <Eye className="h-5 w-5" aria-hidden="true" /> Watch
                      </Button>
                    )}
                  </div>
                  {iAmHost && racers.length === 0 && !hostCanGoHome ? (
                    <Button variant="ghost" block onClick={() => void closeLobby()} disabled={Boolean(busy)}>
                      {free ? 'Nobody’s here: close and take my prize back' : 'Nobody’s here: close and take my entry back'}
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
          <p className="mt-4 px-2 text-sm text-fog">
            {cell.prize > 0n
              ? 'If too few join or nobody finishes, the prize goes back to the sponsor and every deposit comes home.'
              : 'If nobody joins or nobody finishes, every entry goes back home.'}
          </p>
        </aside>
      </div>
      {overlay}
    </div>
  );
}
