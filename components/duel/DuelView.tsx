'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ccc } from '@ckb-ccc/connector-react';
import { CheckCircle2, Loader2, Play } from 'lucide-react';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { ChainLoader } from '@/components/arena/ChainLoader';
import { InviteButton } from '@/components/InviteButton';
import { Button } from '@/components/ui/Button';
import { Ckb } from '@/components/ui/kit';
import { ART } from '@/lib/art';
import { ArtilleryReplay } from '@/components/duel/ArtilleryReplay';
import { DuelBoard } from '@/components/duel/DuelBoard';
import { RacePanel } from '@/components/duel/RacePanel';
import { VsBanner } from '@/components/duel/VsBanner';
import { useChainDuel } from '@/components/duel/useChainDuel';
import { useChainPictures } from '@/components/duel/useChainPictures';
import { useTick } from '@/components/duel/useDuels';
import { useMyLockHash } from '@/hooks/useMyLockHash';
import { useWallet } from '@/hooks/useWallet';
import { getCkbClient } from '@/lib/ckb/client';
import { newSessionKey, returnKeyCell } from '@/lib/crown/chain';
import { fire, replay, type ArtilleryState, type ShotRecord } from '@/lib/duel/artillery';
import { acceptDuel, cancelDuel, finishDuel, fireShot, skipTurns } from '@/lib/duel/chain';
import { KIND_ARTILLERY, KIND_RACE, STATUS_OPEN, timerShrinkMs, turnMs } from '@/lib/duel/codec';
import { forgetDuelKey, loadDuelKey, pendingKeys, rememberPendingKey, saveDuelKey } from '@/lib/duel/keys';
import { nameOf } from '@/lib/registry/chain-names';
import { bytesToHex } from '@/lib/sudden-death/codec';

const ZERO = `0x${'0'.repeat(64)}`;
const CKB = 100_000_000n;
/** How long past the other player's clock to wait before skipping their turn: a shot sent in time may still be landing. */
const LANDING_GRACE_MS = 30_000;
const noSubscribe = () => () => undefined;

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

function message(error: unknown, fallback: string): string {
  const text = error instanceof Error ? `${error.message} ${(error as { data?: string }).data ?? ''}` : '';
  if (/immature/i.test(text)) return 'The chain’s clock runs a little behind the wall clock. Try again in a minute.';
  // Someone else's move (a skip, or the other shot) spent the duel cell first: the duel moved on.
  if (/RBF|PoolRejectedDuplicated|Dead|Unknown\(OutPoint|already spent|ConflictTransaction/i.test(text)) {
    return 'Too late: the duel moved on before your shot landed (your turn had already passed). The board is up to date now.';
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

/** One duel, live from the chain: the face-off, then the challenge, the fight, and the result. */
export function DuelView({ id }: { id: string }) {
  const duelId = id.toLowerCase();
  const chain = useChainDuel(duelId);
  const signer = ccc.useSigner();
  const { isConnected } = useWallet();
  const me = useMyLockHash()?.toLowerCase() ?? null;
  const [keyVersion, setKeyVersion] = useState(0);
  const sessionKey = useSyncExternalStore(
    noSubscribe,
    () => (keyVersion >= 0 ? loadDuelKey(duelId) : null),
    () => null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useTick(true, 500);
  const [replaying, setReplaying] = useState(false);
  // A cancel or accept that was signed and sent, until the chain shows it: the duel cell it spent is still the one on screen, so say what is happening instead of looking stuck.
  const [landing, setLanding] = useState<{ what: 'cancel' | 'accept'; point: string } | null>(null);

  const snapshot = chain.snapshot;
  const duel = snapshot?.duel ?? null;
  const challengerHash = duel ? bytesToHex(duel.challenger).toLowerCase() : null;
  const opponentHash = duel ? bytesToHex(duel.opponent).toLowerCase() : null;
  const side: 0 | 1 | null = me && me === challengerHash ? 0 : me && me === opponentHash ? 1 : null;
  const names: [string, string] = [
    side === 0 ? 'You' : challengerHash ? nameOf(chain.names, challengerHash) : '…',
    side === 1 ? 'You' : opponentHash && opponentHash !== ZERO ? nameOf(chain.names, opponentHash) : 'Open seat',
  ];
  const [picture0, picture1] = useChainPictures([challengerHash, opponentHash]);
  const pictures: [string | null, string | null] = [picture0 ?? null, picture1 ?? null];
  const stakeCkb = duel ? Number(duel.stake / CKB) : 0;
  const game = duel?.kind === KIND_RACE ? 'Lane race' : duel && timerShrinkMs(duel.timerMs) > 0n ? 'Artillery · Pressure' : 'Artillery';
  const isOpen = duel?.status === STATUS_OPEN;

  // Artillery: my shot shows straight away; theirs plays out when it lands on chain.
  const [pending, setPending] = useState<{
    count: number;
    board: ArtilleryState;
  } | null>(null);
  const shots = useMemo(() => duel?.shots ?? [], [duel]);
  const chainBoard = chain.board;
  const board = pending && chainBoard && shots.length < pending.count ? pending.board : chainBoard;
  // Shots already on the board when this page opened are history: only newer ones are played out.
  const [firstSeen, setFirstSeen] = useState<number | null>(null);
  if (chainBoard && firstSeen === null) setFirstSeen(shots.length);
  const incoming = useMemo(() => {
    if (!chainBoard || shots.length === 0 || firstSeen === null || shots.length <= firstSeen) return null;
    const last = shots.length - 1;
    if (side !== null && last % 2 === side) return null;
    return {
      id: `${last}`,
      from: replay(chainBoard.seed, shots.slice(0, last)),
      shot: shots[last]!,
    };
  }, [chainBoard, shots, side, firstSeen]);

  const turnSide = board && board.winner === null ? ((board.turn % 2) as 0 | 1) : null;
  const myTurn = side !== null && turnSide === side;
  const deadline =
    snapshot?.landed && duel
      ? Number(snapshot.landed.landedMs + (duel.kind === KIND_ARTILLERY ? turnMs(duel.timerMs, shots.length) : duel.timerMs))
      : null;
  // Once you fire, the turn is theirs on this screen at once; no clock runs until your shot lands.
  const shotInFlight = Boolean(pending && shots.length < pending.count);
  const timeLeft = deadline != null && !shotInFlight ? deadline - now : null;

  // No key saved for this duel: look among the keys made before a wallet approval, in case the wallet reloaded the page before the key could be filed under the duel.
  const myKeyHash = duel && side !== null ? bytesToHex(side === 0 ? duel.key0 : duel.key1).toLowerCase() : null;
  useEffect(() => {
    if (sessionKey || !myKeyHash || /^0x0+$/.test(myKeyHash)) return;
    let stop = false;
    void (async () => {
      for (const secret of pendingKeys()) {
        const signer = new ccc.SignerCkbPrivateKey(getCkbClient(), secret);
        const hash = (await signer.getRecommendedAddressObj()).script.hash().toLowerCase();
        if (stop) return;
        if (hash === myKeyHash) {
          saveDuelKey(duelId, secret);
          setKeyVersion((v) => v + 1);
          return;
        }
      }
    })().catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [sessionKey, myKeyHash, duelId]);

  // When the duel ends, this browser's key cell goes back to its player.
  useEffect(() => {
    if (!chain.gone || !sessionKey || !signer) return;
    void signer
      .getRecommendedAddressObj()
      .then(({ script }) => returnKeyCell(getCkbClient(), sessionKey, script))
      .then(() => forgetDuelKey(duelId))
      .catch(() => undefined);
  }, [chain.gone, sessionKey, signer, duelId]);

  async function run(label: string, task: () => Promise<unknown>, fallback: string) {
    setError(null);
    setBusy(label);
    try {
      await task();
      chain.refresh();
    } catch (cause) {
      setError(message(cause, fallback));
    } finally {
      setBusy(null);
    }
  }

  function accept() {
    if (!signer || !snapshot) return;
    void run(
      'Approve in your wallet to lock your stake…',
      async () => {
        const session = await newSessionKey(getCkbClient());
        rememberPendingKey(session.secret);
        await acceptDuel(signer, snapshot.point, session);
        saveDuelKey(duelId, session.secret);
        setKeyVersion((v) => v + 1);
        setLanding({ what: 'accept', point: snapshot.point.txHash });
      },
      'The duel could not be accepted.',
    );
  }

  function shoot(shot: ShotRecord) {
    if (!snapshot || !sessionKey || !board) return;
    setPending({
      count: shots.length + 1,
      board: fire(board, shot, shot.wind).next,
    });
    void run(
      'Your shot is landing on chain…',
      // A shot the chain refused never lands: put the board back so it can be fired again.
      () =>
        fireShot(getCkbClient(), snapshot.point, sessionKey, shot).catch((cause: unknown) => {
          setPending(null);
          throw cause;
        }),
      'The shot could not be sent.',
    );
  }

  const result = board?.winner ?? null;
  const raceDone = duel?.kind === KIND_RACE && duel.submitted === 0b11;
  const canCollect = !chain.gone && snapshot && duel?.status === 1 && (result !== null || raceDone);
  // A race whose time is up is decided too: a racer who never handed in scores 0.
  const raceTimeUp = !chain.gone && duel?.kind === KIND_RACE && duel.status === 1 && !raceDone && timeLeft != null && timeLeft <= 0;
  // Artillery: the other player's clock ran out.
  const theirClockOut =
    !chain.gone && duel?.kind === KIND_ARTILLERY && side !== null && Boolean(sessionKey) && turnSide !== null && turnSide !== side && timeLeft != null && timeLeft <= 0;
  const theirTimeUp = theirClockOut && timeLeft != null && timeLeft <= -LANDING_GRACE_MS;

  // Nobody taps anything to end a turn or a duel: this browser sends the skip or the payout itself, with no wallet.
  const sent = useRef<{ what: string; at: number } | null>(null);
  const refresh = chain.refresh;
  useEffect(() => {
    if (!snapshot) return;
    const what = theirTimeUp ? `skip:${snapshot.point.txHash}` : canCollect || raceTimeUp ? `pay:${snapshot.point.txHash}` : null;
    if (!what) return;
    const last = sent.current;
    if (last && last.what === what && now - last.at < 12_000) return;
    sent.current = { what, at: now };
    const task = theirTimeUp
      ? skipTurns(getCkbClient(), snapshot.point, sessionKey!, 1)
      : finishDuel(getCkbClient(), snapshot.point, raceTimeUp);
    void task.then(refresh).catch(() => undefined);
  }, [snapshot, theirTimeUp, canCollect, raceTimeUp, sessionKey, now, refresh]);

  if (chain.loading) {
    return (
      <ArenaStage backHref="/duels" backLabel="Duels">
        <ChainLoader title="Finding the duel" note="Reading it straight from the chain." />
      </ArenaStage>
    );
  }
  if (!snapshot) {
    return (
      <ArenaStage backHref="/duels" backLabel="Duels">
        {/* The page keeps looking every few seconds, so a challenge still on its way appears by itself. */}
        <ChainLoader
          title="Waiting for the chain"
          note="A new challenge takes a block or two to land, usually under a minute. This page opens the duel as soon as it does. If nothing appears after a few minutes, check the link."
        />
      </ArenaStage>
    );
  }

  return (
    <ArenaStage backHref="/duels" backLabel="Duels">
      <p className="font-mono text-[11px] uppercase tracking-wider text-pink">Duel · {game}</p>
      <h1 className="mb-6 mt-1 font-poster text-2xl font-black uppercase md:text-4xl">
        {isOpen ? (side === 0 ? 'Your challenge' : 'A challenge') : chain.gone ? 'Duel over' : side === null ? 'Watching a duel' : 'Your duel'}
      </h1>
      <VsBanner names={names} stakeCkb={stakeCkb} game={game} active={isOpen ? null : turnSide} hp={null} pictures={pictures} stage={isOpen ? (chain.gone ? 'cancelled' : 'open') : 'live'} />

      {chain.gone && isOpen ? (
        // Taken back before anyone accepted: no duel was played, and the stake went home.
        <div className="clip-panel mt-5 flex flex-col items-center bg-ink-2 px-6 py-10 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ART.empty} alt="" className="w-full max-w-[260px] rounded-2xl" />
          <h2 className="mt-6 font-poster text-xl font-black uppercase">Challenge cancelled</h2>
          <p className="mt-2 max-w-sm text-sm text-mute">
            {side === 0
              ? `You took it back before anyone accepted. Your ${stakeCkb} CKB came back to your wallet.`
              : `${names[0]} took it back before anyone accepted. No duel was played.`}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button variant="pink" href="/duels/new">
              New challenge
            </Button>
            <Button variant="ghost" href="/duels">
              Back to duels
            </Button>
          </div>
        </div>
      ) : chain.gone ? (
        <>
          <ResultPanel winner={result} names={names} stakeCkb={stakeCkb} side={side} paid />
          {duel?.kind === KIND_ARTILLERY && chainBoard && shots.length > 0 ? (
            <div className="mt-5">
              {replaying ? (
                <ArtilleryReplay
                  seed={chainBoard.seed}
                  shots={shots}
                  names={names}
                  pictures={pictures}
                  onClose={() => setReplaying(false)}
                />
              ) : (
                <ReplayButton onClick={() => setReplaying(true)}>Watch replay</ReplayButton>
              )}
            </div>
          ) : null}
        </>
      ) : isOpen && landing?.point === snapshot.point.txHash ? (
        <div className="clip-panel mt-5 bg-ink-2">
          {landing.what === 'cancel' ? (
            <ChainLoader
              compact
              title="Cancelling"
              note={`Your ${stakeCkb} CKB is on its way back. The chain takes a block or two to confirm it, usually under a minute.`}
            />
          ) : (
            <ChainLoader
              compact
              title="Locking your stake"
              note="The battlefield appears as soon as your stake lands on chain, usually under a minute."
            />
          )}
        </div>
      ) : isOpen ? (
        <div className="mt-5">
          {side === 0 ? (
            <div className="clip-panel bg-ink-2 p-6 md:p-8">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-pink" aria-hidden="true" />
                <h2 className="font-poster text-lg font-bold uppercase">
                  {names[1] === 'Open seat' ? 'Waiting for anyone to take it' : `Waiting for ${names[1]} to accept`}
                </h2>
              </div>
              <p className="mt-2 max-w-xl text-sm text-mute">
                Send them the link. When they accept, their {stakeCkb} CKB locks next to yours, and the block it lands in shapes the
                battlefield.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <InviteButton
                  tone="pink"
                  url={typeof window === 'undefined' ? '' : window.location.href}
                  title="Crowns duel"
                  text={`I challenge you to ${game.toLowerCase()} for ${stakeCkb * 2} CKB on Crowns.`}
                  variant="arena"
                />
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() =>
                    signer &&
                    void run(
                      'Approve to take your stake back…',
                      async () => {
                        await cancelDuel(signer, snapshot.point);
                        setLanding({ what: 'cancel', point: snapshot.point.txHash });
                      },
                      'Could not cancel.',
                    )
                  }
                  disabled={Boolean(busy) || !signer}
                >
                  {busy ?? 'Cancel challenge'}
                </Button>
              </div>
            </div>
          ) : opponentHash === ZERO || side === 1 ? (
            <div className="clip-panel bg-ink-2 p-6 md:p-8">
              <h2 className="font-poster text-xl font-black uppercase md:text-2xl">{names[0]} challenges you</h2>
              <p className="mt-2 max-w-xl text-sm text-mute">
                Lock {stakeCkb} CKB to match theirs. Win and you take {stakeCkb * 2} CKB. Your moves are signed in this browser: no more
                wallet pop-ups.
              </p>
              <p className="mt-1 text-sm text-mute">{game}. Check the picture and name before you accept.</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                {isConnected ? (
                  <Button variant="pink" size="xl" onClick={accept} disabled={Boolean(busy)}>
                    {busy ?? `Accept and lock ${stakeCkb} CKB`}
                  </Button>
                ) : (
                  <p className="text-sm text-gold">Connect your wallet from the header to accept.</p>
                )}
                <Button variant="outline" size="xl" href="/duels">
                  Not now
                </Button>
              </div>
            </div>
          ) : (
            <div className="clip-panel bg-ink-2 p-6 md:p-8">
              <h2 className="font-poster text-lg font-bold uppercase">This challenge is for {names[1]}</h2>
              <p className="mt-2 text-sm text-mute">You can watch once it starts.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6">
          {canCollect ? (
            <ResultPanel
              winner={duel?.kind === KIND_RACE ? null : result}
              names={names}
              stakeCkb={stakeCkb}
              side={side}
              paid={false}
              action={
                <ChainLoader inline title="Paying out on chain…" note="No wallet needed" />
              }
            />
          ) : (
            <TurnBanner
              kind={duel?.kind ?? KIND_ARTILLERY}
              myTurn={myTurn}
              spectating={side === null}
              mover={turnSide !== null ? names[turnSide] : ''}
              timeLeft={timeLeft}
            />
          )}

          {raceTimeUp ? (
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-gold/10 p-4 text-sm text-gold">
              <Loader2 className="h-4 w-4 animate-spin" /> The race time is up. Paying out on chain…
            </p>
          ) : null}

          <div className="mt-5">
            {duel?.kind === KIND_ARTILLERY && board && replaying && chainBoard ? (
              <ArtilleryReplay seed={chainBoard.seed} shots={shots} names={names} pictures={pictures} onClose={() => setReplaying(false)} />
            ) : duel?.kind === KIND_ARTILLERY && board ? (
              <>
                <DuelBoard
                  pictures={pictures}
                  state={board}
                  names={names}
                  wind={chain.wind ?? 0}
                  canFire={
                    myTurn &&
                    Boolean(sessionKey) &&
                    !busy &&
                    !(pending && shots.length < pending.count)
                  }
                  onShot={shoot}
                  incoming={incoming}
                  alert={busy ? null : error}
                  you={side}
                  timeLeft={turnSide !== null ? timeLeft : null}
                  idleNote={
                    side === null
                      ? 'You’re watching this duel.'
                      : !sessionKey
                        ? 'This duel’s play key is in another browser, so you can’t fire from here.'
                        : // Once you have fired, you are simply waiting for them, whether your shot is
                          // still landing or their clock is running (or just ran out: theirs may be landing).
                          myTurn && !shotInFlight
                          ? (busy ?? undefined)
                          : theirTimeUp
                            ? `${names[side === 0 ? 1 : 0]} ran out of time. Passing the turn back to you…`
                            : shotInFlight
                              ? 'Your shot is landing on chain…'
                              : `Waiting for ${names[side === 0 ? 1 : 0]}…`
                  }
                />
                {shots.length > 0 ? (
                  <div className="mt-3">
                    <ReplayButton onClick={() => setReplaying(true)}>Replay from the start</ReplayButton>
                  </div>
                ) : null}
              </>
            ) : duel?.kind === KIND_RACE && side !== null && sessionKey && me ? (
              <RacePanel snapshot={snapshot} side={side} sessionKey={sessionKey} myLockHash={me} onMoved={chain.refresh} />
            ) : duel?.kind === KIND_RACE ? (
              <p className="rounded-2xl bg-ink-2 p-5 text-sm text-mute">
                {side === null ? 'You’re watching this race.' : 'This race’s play key is in another browser.'}
              </p>
            ) : (
              <div className="clip-panel bg-ink-2">
                <ChainLoader compact title="Finding the duel on chain…" note="The battlefield appears once the accept lands." />
              </div>
            )}
          </div>
        </div>
      )}

      {error ? <p className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

    </ArenaStage>
  );
}

function TurnBanner({
  kind,
  myTurn,
  spectating,
  mover,
  timeLeft,
}: {
  kind: number;
  myTurn: boolean;
  spectating: boolean;
  mover: string;
  timeLeft: number | null;
}) {
  const urgent = timeLeft != null && timeLeft < 15_000;
  const title = kind === KIND_RACE ? 'Race on' : myTurn ? 'Your turn' : spectating ? `${mover} to fire` : `${mover} is aiming`;
  return (
    <div
      className={`clip-panel flex flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-7 ${
        myTurn ? 'bg-lime text-ink' : 'bg-ink-2'
      }`}
    >
      <p className="font-poster text-2xl font-black uppercase leading-none md:text-3xl">{title}</p>
      {timeLeft != null ? (
        <div className="text-right">
          <p className={`font-mono text-[10px] uppercase tracking-wider ${myTurn ? 'text-ink/70' : 'text-mute'}`}>
            {kind === KIND_RACE ? 'Race time left' : 'Turn time left'}
          </p>
          <p className={`font-poster text-3xl font-black tabular-nums leading-none ${urgent ? (myTurn ? 'text-danger-deep' : 'text-danger') : ''}`}>{clock(timeLeft)}</p>
        </div>
      ) : null}
    </div>
  );
}

function ResultPanel({
  winner,
  names,
  stakeCkb,
  side,
  paid,
  action,
}: {
  winner: 0 | 1 | 'draw' | null;
  names: [string, string];
  stakeCkb: number;
  side: 0 | 1 | null;
  paid: boolean;
  action?: React.ReactNode;
}) {
  const won = side !== null && winner === side;
  const title =
    winner === 'draw' ? 'A draw' : winner === null ? (paid ? 'Duel over' : 'Race finished') : won ? 'You won!' : `${names[winner]} wins`;
  return (
    <div className="clip-panel mt-5 flex flex-col items-center bg-ink-2 px-6 py-10 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={won ? ART.win : side !== null && winner !== null && winner !== 'draw' ? ART.lose : ART.duels}
        alt=""
        className="aspect-square w-48 rounded-3xl object-cover md:w-60"
      />
      <h2 className="mt-6 font-poster text-4xl font-black uppercase md:text-5xl">{won ? <span className="text-lime">{title}</span> : title}</h2>
      {won ? <Ckb value={stakeCkb * 2} size="xl" sign="+" className="mt-3" /> : null}
      <p className="mt-3 max-w-md text-mute">
        {winner === 'draw'
          ? `Each side gets their ${stakeCkb} CKB back.`
          : winner === null
            ? paid
              ? 'This duel has been paid out.'
              : 'Both runs are in and scored on chain. Pay it out to see who takes the stakes.'
            : `${winner === side ? 'You take' : `${names[winner]} takes`} ${stakeCkb * 2} CKB.`}
        {paid ? '' : ' Anyone can send the payout: the script only lets the money go to the winner.'}
      </p>
      <div className="mt-6 flex min-h-[64px] items-center justify-center rounded-2xl bg-ink px-5 py-3">
        {paid ? (
          <span className="inline-flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-6 w-6 text-lime" aria-hidden="true" /> {winner === 'draw' ? 'Returned' : 'Paid'}
          </span>
        ) : (
          action
        )}
      </div>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Button variant="pink" size="lg" href="/duels/new">
          New challenge
        </Button>
        <Button variant="outline" size="lg" href="/duels">
          Back to duels
        </Button>
      </div>
    </div>
  );
}

/** Starts a replay: the duel's shots fired again, one by one, on the board they were played on. */
function ReplayButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <Button variant="ghost" size="lg" onClick={onClick}>
      <Play className="h-4 w-4 fill-current" aria-hidden="true" />
      {children}
    </Button>
  );
}
