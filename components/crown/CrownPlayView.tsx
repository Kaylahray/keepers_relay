'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Crown, LoaderCircle, Timer } from 'lucide-react';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { ChainLoader } from '@/components/arena/ChainLoader';
import { Avatar } from '@/components/duel/Avatar';
import { useChainPictures } from '@/components/duel/useChainPictures';
import { Button } from '@/components/ui/Button';
import { Ckb, EmptyState, StatusChip } from '@/components/ui/kit';
import { ART } from '@/lib/art';
import { ArenaRailCard, ArenaStage } from '@/components/arena/ArenaStage';
import { leftMs, playClock, useNow } from '@/components/crown/BleedingClock';
import { VerifiedSeal } from '@/components/crown/VerifiedSeal';
import { CrownLobby } from '@/components/crown/CrownLobby';
import { useCrown } from '@/components/crown/useCrown';
import { CrownRunLayer } from '@/components/crown/CrownRunLayer';
import { DepthsLayer } from '@/components/crown/DepthsLayer';
import { UpgradeStrip } from '@/components/game/RunScreens';
import { RelicStrip } from '@/components/game/DepthsScreens';
import { crownGame } from '@/lib/crown/games';
import { usePrizeStanding } from '@/components/crown/usePrizeStanding';
import type { DrivenLap } from '@/components/game/CrownRunDrive';
import { arenaCoverForSeed } from '@/lib/poster';
import { InviteButton } from '@/components/InviteButton';
import { HowToPlayIntro } from '@/components/explain/HowToPlayIntro';
import { LapPanel } from '@/components/crown/LapPanel';
import { ccc } from '@ckb-ccc/connector-react';
import { bytesToHex, hexToBytes, runSeed } from '@/lib/sudden-death/codec';
import { keepOldRunKey, loadLapRun, saveLapRun, type DrivenLapRecord } from '@/lib/crown/my-laps';
import { withPicks, type LockedLap } from '@/lib/game/crown-run';
import {
  bidRefundAt,
  closeCrown,
  entryGone,
  entryLap,
  expireBid,
  countEntries,
  lockBid,
  EntryGoneError,
  isLostRace,
  MatchMovedError,
  newSessionKey,
  returnKeyCell,
  openMatch,
  RoadExpiredError,
  RunBeatenError,
  sealLap,
  stealCrown,
  type EntryLap,
} from '@/lib/crown/chain';
import { forgetBid, rememberBid, rememberedBid } from '@/lib/crown/my-bid';
import { deleteCrownRemote, fetchCrownList, joinCrownRemote, pushCrownState } from '@/lib/crown/remote';
import { useWallet } from '@/hooks/useWallet';
import { useMyLockHash } from '@/hooks/useMyLockHash';
import { useRequireUsername } from '@/hooks/useRequireUsername';
import { useAuth } from '@/context/auth-provider';
import { suddenDeathConfigured } from '@/lib/registry/config';
import { getCkbClient } from '@/lib/ckb/client';
import { plainChainError } from '@/lib/ckb/errors';
import { isHostWallet } from '@/lib/crown/standing';
import { nowMs } from '@/lib/crown/clock';
import { gameStartAt, inEntryWindow } from '@/lib/crown/phase';
import {
  ckbWhole,
  DEFAULT_DURATION_MS,
  forgetCrown,
  GAMES,
  kickoff,
  loadCrown,
  saveCrown,
  settleCrown,
  type CrownRoom,
  crownShareUrl,
} from '@/lib/crown/rooms';

function scriptHash(lock: { codeHash: string; hashType: 'type' | 'data' | 'data1' | 'data2'; args: string }) {
  return ccc.Script.from({ codeHash: lock.codeHash, hashType: lock.hashType, args: lock.args }).hash();
}

/** The tab title's words. The server only sets the title once, when the page loads. */
function tabHeadline(room: CrownRoom, now: number) {
  if (room.status === 'settled') return room.king ? `${room.king} took the crown with ${room.kingScore}` : 'This crown is closed';
  if (room.status === 'lobby') return 'Join the lobby before the clock starts';
  if (inEntryWindow(room, now)) return 'Starting soon';
  if (room.deadlineAt != null && room.deadlineAt <= now) {
    return room.king ? `Time’s up: ${room.king} holds the crown at ${room.kingScore}` : 'Time ran out with the crown open';
  }
  return room.kingScore > 0 ? `Beat ${room.kingScore} to take the crown` : 'The crown is open. Take it.';
}

/** Entries paid so far, read from the chain. Separate from the pot: an entry only joins it by taking the crown. */
function EntriesPaid({ matchId, hostLockHash, feeShannons, landing }: { matchId: string; hostLockHash: string; feeShannons: bigint; landing: boolean }) {
  const { data: count } = useQuery({
    queryKey: ['crown-entries', matchId, hostLockHash],
    queryFn: () => countEntries(getCkbClient(), matchId, hostLockHash),
    refetchInterval: 10_000,
  });
  return (
    <p className="mt-2 min-h-4 font-mono text-[11px] text-mute">
      {count == null ? null : count === 0 ? (landing ? 'Your entry is landing…' : 'No entries paid yet') : `${count} ${count === 1 ? 'entry' : 'entries'} paid · ${ckbWhole(feeShannons * BigInt(count))} CKB`}
    </p>
  );
}

/** Font size for a number in the pot / crown / clock row. */
function fitFont(text: string, maxRem: number): string {
  const chars = Math.max(3, text.length);
  return `min(${maxRem}rem, calc((100vw - 64px) / 3 / ${(chars * 0.82).toFixed(2)}))`;
}

/** Automatic resends after losing a same-moment race for the crown, before handing back to the player. */
const RESEND_LIMIT = 3;

function formatWait(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function chainMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  if (/still confirming/i.test(message)) return message;
  if (/RBF|unconfirmed inputs|PoolRejectedDuplicatedTransaction|conflict/i.test(message)) {
    return 'Someone else grabbed it first. Check the new score to beat.';
  }
  if (/Resolve failed|Unknown\(OutPoint|out ?point/i.test(message)) {
    return 'Still confirming. Try again in a few seconds.';
  }
  if (/immature|since requirement/i.test(message)) {
    return 'Not yet. This opens a minute or two after zero.';
  }
  if (/error code -12/.test(message)) {
    return 'The chain scored your run differently, so the crown did not move. Your entry is still yours.';
  }
  return plainChainError(error, fallback);
}

export function CrownPlayView({ id }: { id: string }) {
  const router = useRouter();
  const { room, seats, ready, unreachable } = useCrown(id);
  const kit = crownGame(room?.game ?? 'crown-run');
  // Each game plays its laps on its own full screen; the chain flow around them is the same.
  const RunLayerFor = room?.game === 'depths' ? DepthsLayer : CrownRunLayer;
  // A connected wallet with no username is sent to /join and comes back here after claiming one.
  const named = useRequireUsername();
  const [kingPicture] = useChainPictures([room?.kingHash]);
  const prize = usePrizeStanding(room);
  const { address, formattedAddress, isConnected } = useWallet();
  const { ensureAuth, authenticated } = useAuth();
  const signer = ccc.useSigner();
  const chain = suddenDeathConfigured();
  const [busy, setBusy] = useState<string | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);
  const myLockHash = useMyLockHash();
  // Live crowns to play next.
  const [nextCrowns, setNextCrowns] = useState<CrownRoom[]>([]);
  const [committed, setCommitted] = useState<{ txHash: string; ok: boolean } | null>(null);
  // The chain's median time and when this page read it, so the wait can count down between reads.
  const [median, setMedian] = useState<{ at: number; readAt: number } | null>(null);
  // The run plays on its own full screen, opened from this page.
  const [inRun, setInRun] = useState(false);
  const [driving, setDriving] = useState(false);
  const [takeAfterLock, setTakeAfterLock] = useState(false);
  const [refund, setRefund] = useState<{ at: number | null; sent: string | null }>({ at: null, sent: null });
  const now = useNow(room?.status === 'live');
  const matchOver =
    room?.status === 'settled' || (room?.status === 'live' && room.deadlineAt != null && room.deadlineAt <= now);

  useEffect(() => {
    if (!matchOver) return;
    let stop = false;
    void fetchCrownList()
      .then((rooms) => {
        if (stop) return;
        const live = rooms.filter(
          (item) => item.id !== id && item.status === 'live' && item.deadlineAt != null && item.deadlineAt > Date.now(),
        );
        setNextCrowns(live.slice(0, 3));
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [id, matchOver]);
  const settling = useRef(false);
  const seenDeadline = useRef<number | null>(null);

  // A live match is ready once its newest transaction is committed.
  const matchTx = chain && room?.status === 'live' ? room.matchOutPoint?.txHash ?? null : null;
  const matchReady = matchTx ? committed?.txHash === matchTx && committed.ok : !chain;
  // Only a confirmed "not yet" counts as waiting.
  const matchPending = Boolean(matchTx && committed?.txHash === matchTx && !committed.ok);

  useEffect(() => {
    if (!matchTx) return;
    const txHash = matchTx;
    let stop = false;
    let timer = 0;
    const look = async () => {
      try {
        const tx = await getCkbClient().getTransaction(txHash);
        if (stop) return;
        const ok = tx?.status === 'committed';
        setCommitted({ txHash, ok });
        // Committed is final for this transaction; stop asking until the match moves again.
        if (ok) window.clearInterval(timer);
      } catch {
        // A failed read says nothing about the transaction. Keep the last answer and ask again.
      }
    };
    void look();
    timer = window.setInterval(() => void look(), 2000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [matchTx]);

  // Closing is gated on the chain's median time, which runs a few minutes behind the wall clock.
  const pastDeadline = room?.deadlineAt != null && room.deadlineAt <= now;
  useEffect(() => {
    if (!chain || room?.status !== 'live' || !pastDeadline) return;
    let stop = false;
    // Block timestamps never change, so each block is fetched once; later reads only fetch new ones.
    const stampOf = new Map<number, number>();
    const look = async () => {
      try {
        const client = getCkbClient();
        const tip = await client.getTipHeader();
        const tipNum = Number(tip.number);
        stampOf.set(tipNum, Number(tip.timestamp));
        const wanted = Array.from({ length: 37 }, (_, index) => tipNum - index);
        const missing = wanted.filter((num) => !stampOf.has(num));
        const fetched = await Promise.all(missing.map((num) => client.getHeaderByNumber(num)));
        missing.forEach((num, index) => {
          const header = fetched[index];
          if (header) stampOf.set(num, Number(header.timestamp));
        });
        for (const num of stampOf.keys()) if (num < tipNum - 36) stampOf.delete(num);
        const stamps = wanted
          .map((num) => stampOf.get(num) ?? 0)
          .filter((stamp) => stamp > 0)
          .sort((left, right) => left - right);
        const mid = stamps[Math.floor(stamps.length / 2)];
        if (!stop && mid) setMedian({ at: mid, readAt: Date.now() });
      } catch {
        // A failed read leaves the last answer in place; the next one tries again.
      }
    };
    void look();
    const timer = window.setInterval(() => void look(), 5_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [chain, room?.status, pastDeadline]);

  // Once the chain allows a close, every open page sends one, so a crown pays out without anyone pressing a button or signing anything.
  const autoClosed = useRef<number | null>(null);
  const holdsCrown = Boolean(myLockHash && room?.kingHash && room.kingHash.toLowerCase() === myLockHash.toLowerCase());
  const closeOpen = Boolean(
    chain && room?.matchId && room.status === 'live' && median && room.deadlineAt != null && median.at >= room.deadlineAt,
  );
  const autoClose = useEffectEvent(() => void closeMatch(true));
  useEffect(() => {
    const deadline = room?.deadlineAt;
    if (!closeOpen || deadline == null || autoClosed.current === deadline) return;
    const wait = holdsCrown ? 0 : 15_000 + Math.floor(Math.random() * 15_000);
    const timer = window.setTimeout(() => {
      autoClosed.current = deadline;
      autoClose();
    }, wait);
    return () => window.clearTimeout(timer);
  }, [closeOpen, holdsCrown, room?.deadlineAt]);

  // A crown with no match cell has nothing on chain to close, so its screen closes it.
  useEffect(() => {
    if (!room || room.status !== 'live' || room.deadlineAt == null) return;
    if (seenDeadline.current !== room.deadlineAt) {
      seenDeadline.current = room.deadlineAt;
      settling.current = false;
    }
    if (settling.current || room.matchId) return;
    if (leftMs(room.deadlineAt, nowMs()) > 0) return;
    settling.current = true;
    saveCrown(
      settleCrown(room, room.king ? `${room.king} holds the crown at the deadline.` : 'Nobody took the crown.'),
    );
  }, [room, now]);

  const tabTitle = room ? `${tabHeadline(room, now)} · ${room.title}` : null;
  useEffect(() => {
    if (tabTitle) document.title = tabTitle;
  }, [tabTitle]);

  const seatBid = room ? seats.find((seat) => seat.address === address.trim().toLowerCase())?.bidOutPoint ?? null : null;
  const savedBid = room ? rememberedBid(room.id, address) : null;
  const entryBid = room?.bidOutPoint ?? seatBid ?? savedBid;

  // The next lap the chain has revealed for this entry.
  const [lapFound, setLapFound] = useState<{ entry: string; next: EntryLap } | null>(null);
  const entryKey = entryBid ? `${entryBid.txHash}:${entryBid.index}` : null;
  const matchIdForRoad = room?.matchId ?? null;
  useEffect(() => {
    if (!chain || !matchIdForRoad || !myLockHash || !entryBid || !entryKey) return;
    let stop = false;
    let timer = 0;
    const look = async () => {
      const next = await entryLap(getCkbClient(), matchIdForRoad, myLockHash, entryBid).catch(() => null);
      if (stop) return;
      if (next) {
        setLapFound({ entry: entryKey, next });
        return;
      }
      // A used entry would otherwise be waited on forever and hide the pay button.
      const gone = await entryGone(getCkbClient(), entryBid).catch(() => false);
      if (stop) return;
      if (gone) forgetEntry();
      else timer = window.setTimeout(() => void look(), 2_000);
    };
    void look();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
    // entryKey stands for entryBid, so the effect does not restart on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, matchIdForRoad, myLockHash, entryKey]);
  const foundLap = lapFound && lapFound.entry === entryKey ? lapFound.next : null;

  // This browser's run: the session key that locks its laps and every lap locked so far.
  const [runVersion, setRunVersion] = useState(0);
  const roomKey = room?.id ?? null;
  const lapRun = useMemo(
    () => (roomKey && address && typeof window !== 'undefined' ? loadLapRun(roomKey, address) : null),
    // runVersion re-reads storage after a lock or a new entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomKey, address, runVersion],
  );
  // Right after a new entry the page can still be reading the old one; its lap is not this run's.
  const nextLap = foundLap && (!lapRun?.entryTx || foundLap.point.txHash === lapRun.entryTx) ? foundLap : null;
  const sealedLaps = useMemo(() => lapRun?.laps ?? [], [lapRun]);
  const driven = lapRun?.driven ?? null;
  // A run ends with its last lap, a crash, or the crown.
  const lateLap = Boolean(nextLap?.late);
  const runOver = sealedLaps.length >= kit.rules.laps || Boolean(sealedLaps.at(-1)?.crashed) || Boolean(driven?.crashed) || Boolean(lapRun?.finished) || lateLap;
  // The chain and this browser agree on how many laps are locked.
  const inSync = !nextLap || nextLap.sealed === sealedLaps.length;
  const lockedLaps = useMemo<LockedLap[]>(
    () =>
      matchIdForRoad && myLockHash
        ? sealedLaps.map((lap) => ({ seed: runSeed(matchIdForRoad, myLockHash, lap.block), bytes: hexToBytes(lap.tape) }))
        : [],
    [matchIdForRoad, myLockHash, sealedLaps],
  );
  const nextSeed = nextLap && !nextLap.late && lapRun && inSync && !runOver ? nextLap.seed : null;
  // A run that can no longer be sent (its window shut, or the game ended) gives its key cell back.
  const runDone =
    lapRun != null &&
    !lapRun.keyReturned &&
    (lapRun.finished ||
      room?.status !== 'live' ||
      (room.deadlineAt != null && room.deadlineAt <= now) ||
      (nextLap != null && nextLap.windowEndsMs <= now));
  const returning = useRef<string | null>(null);
  const returnTries = useRef(0);
  useEffect(() => {
    if (!runDone || !lapRun || !signer || !address || !roomKey || returning.current === lapRun.session) return;
    const session = lapRun.session;
    returning.current = session;
    void (async () => {
      const sent = await returnKeyCell(signer.client, session as `0x${string}`, (await signer.getRecommendedAddressObj()).script);
      if (!sent) throw new Error('The key cell is not visible yet.');
      saveLapRun(roomKey, address, { ...lapRun, keyReturned: true });
      setRunVersion((version) => version + 1);
    })().catch((error: unknown) => {
      console.warn('Key cell return failed:', error);
      // A seal still landing holds the key cell, or the network dropped: keep trying, slower each time.
      returnTries.current += 1;
      window.setTimeout(retryReturn, Math.min(15_000 * returnTries.current, 60_000));
    });
  }, [runDone, lapRun, signer, address, roomKey]);
  function retryReturn() {
    returning.current = null;
    setRunVersion((version) => version + 1);
  }
  useEffect(() => {
    if (!runDone) return;
    window.addEventListener('online', retryReturn);
    return () => window.removeEventListener('online', retryReturn);
  }, [runDone]);

  // An entry left over after the close can come back once its refund time passes.
  useEffect(() => {
    if (!chain || room?.status !== 'settled' || !entryBid) return;
    let stop = false;
    void bidRefundAt(getCkbClient(), entryBid)
      .then((at) => {
        if (!stop) setRefund((current) => ({ ...current, at }));
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [chain, room?.status, entryBid]);

  // A crashed lap that beats the crown is locked first, then takes it once the lock has landed.
  const takeNow = useEffectEvent(() => {
    setTakeAfterLock(false);
    void takeCrown();
  });
  const lockLanded = takeAfterLock && nextLap != null && sealedLaps.length > 0 && nextLap.sealed === sealedLaps.length;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (lockLanded) takeNow();
  }, [lockLanded]);

  if (!ready) {
    return (
      <ArenaStage>
        <ChainLoader title="Loading the game…" />
      </ArenaStage>
    );
  }

  if (isConnected && !named.ready) {
    return (
      <ArenaStage>
        {named.username && !authenticated ? (
          <>
            <p className="text-mute">Sign in as @{named.username} to join this crown.</p>
            <ArenaCta onClick={() => void ensureAuth().catch(() => undefined)} className="mt-4">
              Sign in
            </ArenaCta>
          </>
        ) : (
          <ChainLoader title="Checking your username…" />
        )}
      </ArenaStage>
    );
  }

  if (!room) {
    return (
      <ArenaStage backHref="/play" backLabel="Crowns">
        <EmptyState
          title={unreachable ? 'Connection lost' : 'Game not found'}
          body={unreachable ? 'Could not reach this game. Retrying…' : 'This game does not exist or was deleted.'}
          action={<Button href="/play">Find a crown</Button>}
        />
      </ArenaStage>
    );
  }

  // The chain records the king as a lock hash; compare against ours.
  let iHold = false;
  if (myLockHash && room.kingHash) {
    iHold = room.kingHash.toLowerCase() === myLockHash.toLowerCase();
  } else if (room.kingLock && myLockHash) {
    try {
      iHold = scriptHash(room.kingLock).toLowerCase() === myLockHash.toLowerCase();
    } catch {
      iHold = false;
    }
  }
  const iHost = isHostWallet(room, address, myLockHash);
  const live = room.status === 'live';
  const startsAt = gameStartAt(room);
  const entryWindow = inEntryWindow(room, now);
  const clock = playClock(room.deadlineAt, now);
  const clockLeft = leftMs(room.deadlineAt, now);
  const panic = live && !entryWindow && room.deadlineAt != null && clockLeft <= 4_000 && clockLeft > 0;
  // The bar measures the match's full length, so every crown taken visibly lops a chunk off.
  const potText = ckbWhole(room.potShannons);
  const clockText = entryWindow && startsAt != null ? formatWait(startsAt - now) : live ? clock.face : 'Closed';
  const clockSpan = Math.max(1, room.durationMs || DEFAULT_DURATION_MS);
  const clockProgress = room.deadlineAt == null ? 0 : Math.max(0, Math.min(100, (clockLeft / clockSpan) * 100));
  // The open is still confirming: only while the clock is running, and only once the chain has said "not yet".
  const confirmingOpen =
    chain && live && clock.counting && Boolean(room.matchId) && matchPending && room.round <= 1 && !room.king && room.potShannons === 0n;
  const cellMoving = chain && live && Boolean(room.matchId) && matchPending && !confirmingOpen;
  const medianAt = median?.at ?? null;
  // Confirmed by the last read: the chain will accept a close now.
  const sinceReady = medianAt != null && room.deadlineAt != null && medianAt >= room.deadlineAt;
  const shownError = !matchReady && chainError && /not on chain yet|still confirming/i.test(chainError) ? null : chainError;
  const onChain = chain && Boolean(room.matchId);
  // On chain the run is played in laps on an entry; the score is the run's score after its last locked lap.
  const lapMode = onChain && Boolean(entryBid);
  const runScore = sealedLaps.at(-1)?.score ?? 0;
  const beats = lapMode && sealedLaps.length > 0 && runScore > room.kingScore && !lateLap;
  // Stop offering steals once the clock hits zero, even before the chain enforces it.
  const timeUp = live && room.deadlineAt != null && !clock.counting;
  const roadLeft = nextLap ? nextLap.windowEndsMs - now : null;
  const roadOpen = roadLeft != null && roadLeft > kit.timing.LOCK_MARGIN_MS;
  const windowLeft = roadLeft != null ? Math.max(0, roadLeft - kit.timing.LOCK_MARGIN_MS) : null;
  // Too little time left to drive this lap, and nothing driven to lock: only a new entry can help.
  const outOfRoad = windowLeft != null && windowLeft < kit.timing.LAP_NEEDS_MS && !driven;
  const canTake = live && !entryWindow && !timeUp && beats && !iHold && isConnected && onChain && matchReady && inSync && roadOpen && !busy;
  const currentLap = sealedLaps.length + 1;
  const owned = kit.owned(lockedLaps.map((lap) => lap.bytes));
  const crownName = iHold ? 'You' : room.king;
  const shortClock = live && !entryWindow && clock.counting && clockLeft < kit.timing.RUN_NEEDS_MS;
  const entriesClosed = live && !entryWindow && clockLeft < kit.timing.ENTRY_NEEDS_MS;
  // An entry in progress shows its steps on the pay button itself.
  const paying = busy != null && /entry|key cell/i.test(busy);
  const showPay =
    onChain && live && !entryWindow && !timeUp && !iHold && isConnected && matchReady && (!busy || paying) && (!entryBid || (nextLap && inSync && !beats && (runOver || outOfRoad || !roadOpen)));

  async function lockEntry(current: CrownRoom): Promise<CrownRoom> {
    if (!signer) throw new Error('Connect your wallet to pay the entry.');
    // A throwaway key for this run: it seals each lap without asking the wallet.
    if (lapRun && !lapRun.keyReturned) {
      // The new run's key replaces this one, so keep it until its cell is back, even if this return fails.
      if (address) keepOldRunKey(address, lapRun.session);
      setBusy('Returning your last run’s key cell…');
      // Best effort: a key cell too small to stand alone under the owner’s lock can’t go back by itself.
      await returnKeyCell(signer.client, lapRun.session as `0x${string}`, (await signer.getRecommendedAddressObj()).script).catch(
        () => null,
      );
    }
    const session = await newSessionKey(signer.client);
    const next = await lockBid(signer, current, session, setBusy);
    saveCrown(next);
    if (address) {
      saveLapRun(current.id, address, { session: session.secret, laps: [], entryTx: next.bidOutPoint?.txHash });
      setRunVersion((version) => version + 1);
    }
    if (address && next.bidOutPoint) {
      rememberBid(current.id, address, next.bidOutPoint);
      void joinCrownRemote(current.id, {
        address,
        displayName: formattedAddress || 'Player',
        bidOutPoint: next.bidOutPoint,
      }).catch(() => undefined);
    }
    setInRun(true);
    return next;
  }

  /** The entry moved (a lock spends it and makes it again): remember where it is now, everywhere. */
  function moveEntry(point: { txHash: string; index: string }) {
    if (!room) return;
    const local = loadCrown(id) ?? room;
    saveCrown({ ...local, bidOutPoint: point });
    if (address) {
      rememberBid(room.id, address, point);
      void joinCrownRemote(room.id, { address, displayName: formattedAddress || 'Player', bidOutPoint: point }).catch(
        () => undefined,
      );
    }
  }

  /** A lap just driven: kept at once, so a reload can't lose it. A crash that can't take the crown ends the run here. */
  function onDriven(lap: DrivenLap) {
    if (!room || !address || !lapRun) return;
    const record: DrivenLapRecord = { lap: sealedLaps.length, moves: bytesToHex(lap.moves), score: lap.score, coins: lap.coins, crashed: lap.crashed };
    const noPicks = !lap.crashed && kit.picksDue(record.lap) === 0;
    if (noPicks) record.picks = { upgrade: null, road: null };
    saveLapRun(room.id, address, { ...lapRun, driven: record, finished: lap.crashed && lap.score <= room.kingScore });
    setRunVersion((version) => version + 1);
    setDriving(false);
    if (noPicks) void lockDriven(record);
  }

  function onPick(upgrade: number | null, road: number) {
    if (!room || !address || !lapRun || !driven) return;
    const record: DrivenLapRecord = { ...driven, picks: { upgrade, road } };
    saveLapRun(room.id, address, { ...lapRun, driven: record });
    setRunVersion((version) => version + 1);
    void lockDriven(record);
  }

  /** Sends a driven lap and its picks to the chain. They are fixed before the next road exists. */
  async function lockDriven(record: DrivenLapRecord) {
    if (!room || !address || !nextLap || !lapRun) return;
    setChainError(null);
    setBusy(`Locking ${kit.lap} ${record.lap + 1}…`);
    try {
      const bytes = withPicks(hexToBytes(record.moves), record.picks?.upgrade ?? null, record.picks?.road ?? null);
      const point = await sealLap(getCkbClient(), nextLap.point, lapRun.session as `0x${string}`, bytes, setBusy);
      saveLapRun(room.id, address, {
        ...lapRun,
        laps: [...lapRun.laps, { block: nextLap.block, tape: bytesToHex(bytes), score: record.score, crashed: record.crashed, coins: record.coins }],
        driven: null,
        sealedAt: Date.now(),
        entryTx: point.txHash,
      });
      moveEntry(point);
      setRunVersion((version) => version + 1);
    } catch (error) {
      setTakeAfterLock(false);
      setChainError(chainMessage(error, `The ${kit.lap} could not be locked.`));
    } finally {
      setBusy(null);
    }
  }

  function forgetEntry() {
    if (!room) return;
    const local = loadCrown(id);
    if (local?.bidOutPoint) saveCrown({ ...local, bidOutPoint: null });
    if (address) {
      forgetBid(room.id, address);
      void joinCrownRemote(room.id, { address, displayName: formattedAddress || 'Player', clearBid: true }).catch(
        () => undefined,
      );
    }
  }

  async function takeCrown() {
    if (!room || !lapMode) return;
    setChainError(null);
    try {
      await ensureAuth();
    } catch (error) {
      setChainError(error instanceof Error ? error.message : 'Sign in with your wallet to play.');
      return;
    }
    const name = formattedAddress || 'Player';
    if (!signer) {
      setChainError('Connect your wallet. You only sign once, to pay the entry.');
      return;
    }
    try {
      let current = loadCrown(id) ?? room;
      if (nextLap) current = { ...current, bidOutPoint: nextLap.point };
      else if (!current.bidOutPoint && entryBid) current = { ...current, bidOutPoint: entryBid };
      if (!current.bidOutPoint || sealedLaps.length === 0) {
        setChainError(`Pay to enter and lock at least one ${kit.lap} first.`);
        return;
      }
      setBusy('Sending your run…');
      const run = {
        laps: sealedLaps.map((lap) => ({ block: hexToBytes(lap.block), tape: hexToBytes(lap.tape) })),
        score: runScore,
      };
      const client = signer.client;
      // Sends the run, and if another player's steal got there in the same few seconds, sends it again on top of their round.
      const send = async (from: CrownRoom) => {
        for (let attempt = 1; ; attempt += 1) {
          try {
            return await stealCrown(client, from, run, setBusy);
          } catch (error) {
            const deadline = loadCrown(id)?.deadlineAt ?? from.deadlineAt;
            const clockRunning = deadline != null && deadline > Date.now();
            if (!isLostRace(error) || attempt > RESEND_LIMIT || !clockRunning) throw error;
            setBusy(`Someone took it first. Your ${run.score} still beats it, sending again (${attempt}/${RESEND_LIMIT})…`);
            // Give the winning steal a moment to land, so the next try builds on the new round.
            await new Promise((resolve) => setTimeout(resolve, 4_000));
          }
        }
      };
      let result;
      try {
        result = await send(current);
      } catch (error) {
        if (!(error instanceof EntryGoneError)) throw error;
        // The entry this phone remembered was used by an earlier steal (or never landed).
        forgetEntry();
        throw new Error('That entry was already used. Pay a new entry for a new run.');
      }
      const named = { ...result.room, king: name };
      if (address) forgetBid(room.id, address);
      // The run is over. Its session key is kept until the key cell is back with the player.
      if (address && lapRun) saveLapRun(room.id, address, { ...lapRun, finished: true });
      setRunVersion((version) => version + 1);
      saveCrown(named);
      void pushCrownState(named).catch(() => undefined);
      if (address) {
        void joinCrownRemote(room.id, { address, displayName: name, clearBid: true }).catch(() => undefined);
      }
      setInRun(false);
    } catch (error) {
      if (error instanceof MatchMovedError) saveCrown(error.room);
      if (error instanceof RunBeatenError || error instanceof RoadExpiredError) {
        setChainError(error.message);
      } else {
        setChainError(chainMessage(error, 'The run could not be sent.'));
      }
    } finally {
      setBusy(null);
    }
  }

  async function closeMatch(auto = false) {
    if (!room) return;
    setBusy('Closing…');
    if (!auto) setChainError(null);
    try {
      const result = await closeCrown(getCkbClient(), loadCrown(id) ?? room, myLockHash);
      saveCrown(result.room);
      void pushCrownState(result.room).catch(() => undefined);
    } catch (error) {
      if (error instanceof MatchMovedError) saveCrown(error.room);
      // An automatic close usually loses to another page that got there first, which is fine.
      if (!auto) setChainError(chainMessage(error, 'The close failed.'));
    } finally {
      setBusy(null);
    }
  }

  async function returnEntry() {
    if (!entryBid) return;
    setBusy('Getting your entry back…');
    setChainError(null);
    try {
      const txHash = await expireBid(getCkbClient(), entryBid);
      if (room && address) forgetBid(room.id, address);
      setRefund((current) => ({ ...current, sent: txHash }));
    } catch (error) {
      setChainError(chainMessage(error, 'The refund failed.'));
    } finally {
      setBusy(null);
    }
  }

  async function removeLobby() {
    setChainError(null);
    setBusy('Deleting…');
    try {
      await ensureAuth();
      await deleteCrownRemote(id);
      forgetCrown(id);
      router.push('/play');
    } catch (error) {
      setChainError(plainChainError(error, 'The lobby could not be deleted.'));
      setBusy(null);
    }
  }

  async function startClock() {
    if (!room) return;
    setChainError(null);
    if (!chain) {
      const next = kickoff({ ...room, hostAddress: room.hostAddress ?? (address ? address.toLowerCase() : null) });
      saveCrown(next);
      void pushCrownState(next).catch(() => undefined);
      return;
    }
    if (!signer) {
      setChainError('Connect your wallet to start the game.');
      return;
    }
    setBusy('Starting the game…');
    try {
      const opened = await openMatch(signer, room);
      const next = kickoff(
        { ...opened, hostAddress: room.hostAddress ?? (address ? address.toLowerCase() : null) },
        opened.deadlineAt ?? Date.now(),
        null,
      );
      saveCrown(next);
      await pushCrownState(next);
    } catch (error) {
      setChainError(chainMessage(error, 'The game could not start.'));
    } finally {
      setBusy(null);
    }
  }

  if (room.status === 'lobby') {
    return (
      <ArenaStage backHref="/play" backLabel="Crowns">
        <CrownLobby
          room={room}
          seats={seats}
          busy={busy}
          error={shownError}
          onStart={() => void startClock()}
          onDelete={iHost ? () => void removeLobby() : undefined}
        />
      </ArenaStage>
    );
  }

  // Shown only once the chain will accept the close.
  const closeButton =
    chain && room.matchId && live && !confirmingOpen && !entryWindow && !clock.counting && (sinceReady || medianAt == null) ? (
      <div className="clip-panel mt-4 bg-gold/10 p-6">
        <Button variant="gold" size="lg" onClick={() => void closeMatch()} disabled={Boolean(busy)}>
          {busy === 'Closing…' ? busy : 'End the game and pay the winner'}
        </Button>
        <p className="mt-3 text-sm text-mute">The prize goes to the last player who grabbed the crown in time.</p>
      </div>
    ) : null;

  return (
    <ArenaStage backHref="/play" backLabel="Crowns">
      {room.status !== 'settled' ? <HowToPlayIntro game={room.game} /> : null}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            {room.status === 'settled' || (live && !clock.counting && !entryWindow) ? (
              <StatusChip tone="closed">Closed</StatusChip>
            ) : (
              <StatusChip tone="live">Live</StatusChip>
            )}
            <span className="font-mono text-[11px] text-mute">{GAMES[room.game].title}</span>
          </div>
          <h1 className="mt-3 truncate font-poster text-3xl font-black uppercase md:text-5xl">{room.title}</h1>
        </div>
      </div>
      <section className="mt-8 grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="relative z-10 min-w-0 space-y-6">
          {/* Pot and clock. The numbers fit their box, so a ticking clock never reflows the page. */}
          <section aria-label="Prize and clock" className="clip-panel bg-ink-2 p-6 md:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-wider text-mute">{room.status === 'settled' ? 'Prize paid' : 'Prize pot'}</p>
                <p className="mt-2 inline-flex items-baseline gap-1 text-gold">
                  <span className="whitespace-nowrap font-poster font-extrabold leading-none tabular-nums" style={{ fontSize: fitFont(potText, 5) }}>
                    {potText}
                  </span>
                  <span className="font-mono text-base font-bold md:text-xl">CKB</span>
                </p>
                {chain && live && room.matchId && room.hostLockHash ? (
                  <EntriesPaid matchId={room.matchId} hostLockHash={room.hostLockHash} feeShannons={room.feeShannons} landing={Boolean(entryBid)} />
                ) : null}
              </div>
              <div className="sm:text-right">
                <p className="font-mono text-[11px] uppercase tracking-wider text-mute">
                  {entryWindow ? 'Starts in' : clock.counting ? 'Clock' : live ? 'Time up' : 'Closed'}
                </p>
                <p className={`mt-1 inline-flex items-center gap-2 whitespace-nowrap font-poster font-black tabular-nums ${!entryWindow && panic ? 'text-danger' : ''}`} style={{ fontSize: fitFont(clockText, 3) }}>
                  <Timer className="h-7 w-7 shrink-0" aria-hidden="true" />
                  {clockText}
                </p>
              </div>
            </div>
            {live ? (
              <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Time left" aria-valuenow={Math.round(clockProgress)} aria-valuemin={0} aria-valuemax={100}>
                <div className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${panic ? 'bg-danger' : 'bg-lime'}`} style={{ width: `${clockProgress}%` }} />
              </div>
            ) : null}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-2xl bg-ink p-4">
                {room.king ? (
                  <>
                    <Avatar name={room.king} tone="#e1bf47" size={56} src={kingPicture} />
                    <div className="min-w-0">
                      <p className="text-[11px] text-mute">{live && !timeUp ? 'Crown holder' : 'Last holder'}</p>
                      <p className="truncate font-poster text-base font-bold">{iHold ? 'You' : room.king}</p>
                      {prize?.late ? (
                        <p className="mt-1 text-xs font-semibold text-danger">
                          Landed too late to win. {prize.holder ? `The prize goes to ${prize.holder} at ${prize.score}.` : 'The prize goes back to the host.'}
                        </p>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-mute">{live && !timeUp ? 'Nobody holds it yet.' : 'Nobody took the crown.'}</p>
                )}
              </div>
              <div className="rounded-2xl bg-ink p-4">
                <p className="text-[11px] text-mute">{live && !timeUp ? 'Score to beat' : 'Best score'}</p>
                <p className="font-poster text-3xl font-black tabular-nums">{room.kingScore || '—'}</p>
                {live && !timeUp ? <p className="font-mono text-[10px] text-mute">+{ckbWhole(room.feeShannons)} CKB into the pot per crown</p> : null}
              </div>
            </div>
          </section>

          {confirmingOpen ? (
            <div className="clip-panel bg-ink-2">
              <ChainLoader compact title="Setting up the game on chain" note="Practise meanwhile." />
            </div>
          ) : null}

          {room.status === 'settled' ? (
            <div className="clip-panel bg-gold/10 p-6">
              <div className="grid items-center gap-6 md:grid-cols-[180px_1fr]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ART.win} alt="" className="mx-auto w-40 rounded-2xl md:w-full" />
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-gold">Crown closed</p>
                  {room.king ? (
                    <div className="mt-3 flex items-center gap-3">
                      <Avatar name={room.king} tone="#e1bf47" size={56} src={kingPicture} />
                      <div>
                        <p className="font-poster text-xl font-black uppercase">{iHold ? 'You win' : `${room.king} wins`}</p>
                        <Ckb value={ckbWhole(room.potShannons)} size="md" />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <p className="mt-4 max-w-md text-sm text-mute">
                {room.king
                  ? `${ckbWhole(room.potShannons)} CKB went to ${iHold ? 'you' : room.king}, who held the crown at ${room.kingScore}.`
                  : 'Nobody grabbed the crown, so the host got everything back.'}
              </p>
              {room.deadlineAt != null ? (
                <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-mute">
                  Ended {new Date(room.deadlineAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {room.round > 1 ? ` · taken ${room.round - 1} ${room.round === 2 ? 'time' : 'times'}` : ''}
                </p>
              ) : null}
              {room.matchOutPoint ? (
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button href={`/verify/${room.matchOutPoint.txHash}`} variant="pink">
                    Check this crown
                  </Button>
                  <Button href="/play" variant="ghost">
                    Find another crown
                  </Button>
                </div>
              ) : null}
              {chain && entryBid && refund.at != null && !refund.sent ? (
                <div className="mt-6 rounded-2xl bg-ink p-4">
                  <p className="text-sm text-mute">
                    Unused entry.{' '}
                    {now >= refund.at ? 'You can take it back now.' : `Returnable after ${new Date(refund.at).toLocaleTimeString()}.`}
                  </p>
                  <Button size="sm" className="mt-3" onClick={() => void returnEntry()} disabled={Boolean(busy) || now < refund.at}>
                    {busy === 'Getting your entry back…' ? busy : 'Get my entry back'}
                  </Button>
                </div>
              ) : null}
              {refund.sent ? <p className="mt-4 text-sm text-lime">Entry returned · {refund.sent.slice(0, 18)}…</p> : null}
            </div>
          ) : null}

          {live ? (
            <div>
              <div className="clip-panel bg-ink-2 p-6">
                {entryWindow ? (
                  <>
                    <p className="font-mono text-[11px] uppercase tracking-wider text-lime">{entryBid ? 'You’re in' : 'Starting soon'}</p>
                    <p className="mt-2 font-poster text-xl font-black uppercase">{entryBid ? `${kit.play} ${kit.rules.laps} ${kit.lap}s` : 'Get ready'}</p>
                    <p className="mt-1 max-w-xl text-sm text-mute">
                      The round starts for everyone together. You can pay your entry when it starts.
                    </p>
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-lime">
                      {seats.length} seated
                    </p>
                  </>
                ) : iHold ? (
                  <div className="-mx-6 -mt-6 flex items-start justify-between gap-4 bg-gold p-6 text-ink">
                    <div>
                      <p className="font-mono text-[11px] font-bold uppercase tracking-wider">You hold the crown</p>
                      <p className="mt-2 font-poster text-2xl font-black uppercase md:text-3xl">Hold it till zero</p>
                      <p className="mt-1 font-medium">
                        Your score {room.kingScore} is the one to beat. If someone beats it, take it back.
                      </p>
                    </div>
                    <Crown className="h-12 w-12 shrink-0 -rotate-6 fill-ink" aria-hidden="true" />
                  </div>
                ) : lapMode ? (
                  <LapPanel
                    laps={sealedLaps.map((lap) => ({ score: lap.score, crashed: lap.crashed }))}
                    total={kit.rules.laps}
                    lapWord={kit.lap}
                    crashScore={driven?.crashed ? driven.score : null}
                    strip={room.game === 'depths' ? <RelicStrip owned={owned} /> : <UpgradeStrip owned={owned} />}
                    toBeat={room.kingScore}
                    unused={kit.unusedPicks(sealedLaps.map((lap) => hexToBytes(lap.tape)))}
                    runOver={runOver}
                    late={lateLap}
                    otherDevice={!lapRun}
                    onOpen={lapRun && !timeUp && (!runOver || beats || (driven?.crashed && driven.score > room.kingScore)) ? () => setInRun(true) : null}
                    openLabel={driven || runOver ? 'Continue your run' : `${kit.play} ${kit.lap} ${currentLap} of ${kit.rules.laps}`}
                  />
                ) : (
                  <>
                    <p className="font-mono text-[11px] uppercase tracking-wider text-lime">{GAMES[room.game].title}</p>
                    <p className="mt-2 text-sm text-mute">
                      {room.kingScore ? `Beat ${room.kingScore} to take the crown.` : `Nobody holds it yet. Lock in one ${kit.lap} and you can take it.`} {room.game === 'depths' ? 'Each floor gets one torch, 60 seconds, and one try.' : 'Each lap is 30 seconds and you get one try at it.'}
                    </p>
                  </>
                )}
                {!isConnected ? (
                  <div className="mt-4">
                    <ArenaCta onClick={() => void ensureAuth().catch(() => undefined)}>Connect to play for the prize</ArenaCta>
                  </div>
                ) : null}
                {cellMoving ? (
                  <div className="mt-4">
                    <ChainLoader inline title={iHold ? 'Your takeover is landing on chain…' : 'Someone just took the crown. Updating…'} />
                  </div>
                ) : null}
                {timeUp ? (
                  <p className="mt-3 rounded-xl bg-gold/10 p-3 text-sm text-gold">
                    Time&apos;s up. {room.king ? `${iHold ? 'You hold' : `${room.king} holds`} the crown at ${room.kingScore}.` : 'Nobody took the crown.'}
                  </p>
                ) : null}
                {beats && !inRun && !entryWindow && !timeUp && !iHold && isConnected && !(roadLeft != null && !roadOpen) ? (
                  <div className="mt-4">
                    <ArenaCta onClick={() => void takeCrown()} disabled={!canTake}>
                      {busy ?? (!nextLap || !inSync ? `Take it with ${runScore} once your ${kit.lap} lands…` : `Take the crown with ${runScore}`)}
                    </ArenaCta>
                    {!runOver ? <p className="mt-2 text-xs text-mute">Taking the crown ends your run with the {kit.lap}s locked so far.</p> : null}
                  </div>
                ) : null}
                {/* A lap's time starts when the entry lands, so entries open when the round starts, not before. */}
                {showPay ? (
                  <div className="mt-4">
                    {entriesClosed ? (
                      <p className="rounded-lg bg-gold/10 px-3 py-2 text-xs font-semibold text-gold">
                        {`New entries are closed. Only ${clockText} left, which is too short for an entry to land and a ${kit.lap} to lock.`}
                      </p>
                    ) : (
                      <>
                      {shortClock ? (
                        <p className="mb-3 rounded-lg bg-gold/10 px-3 py-2 text-xs font-semibold text-gold">
                          {`Only ${clockText} left on the clock, and a full run takes about ${Math.round(kit.timing.RUN_NEEDS_MS / 60_000)} minutes. It may end before you finish. You can take the crown with the ${kit.lap}s you've locked.`}
                        </p>
                      ) : null}
                      <ArenaCta
                        onClick={() => {
                          setBusy('Getting your entry ready…');
                          setChainError(null);
                          // An unused entry is still refunded at the close; this one gets a new road.
                          if (entryBid) forgetEntry();
                          void lockEntry({ ...(loadCrown(id) ?? room), bidOutPoint: null })
                            .catch((error: unknown) => {
                              if (error instanceof MatchMovedError) saveCrown(error.room);
                              setChainError(chainMessage(error, 'The entry payment failed.'));
                            })
                            .finally(() => setBusy(null));
                        }}
                        disabled={Boolean(busy)}
                      >
                        {busy ? (
                          <span className="inline-flex items-center gap-2">
                            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                            {/Proving work/.test(busy) ? 'Getting your entry ready…' : busy === 'Paying your entry…' ? 'Approve in your wallet…' : busy}
                          </span>
                        ) : entryBid ? (
                          'Pay a new entry'
                        ) : (
                          'Pay to enter'
                        )}
                      </ArenaCta>
                      </>
                    )}
                  </div>
                ) : null}
                <Button href={room.game === 'depths' ? '/practice?game=depths' : '/practice'} variant="ghost" size="sm" className="mt-4">
                  Practice for free
                </Button>
              </div>
              {inRun && lapRun && !iHold ? (
                <RunLayerFor
                  driving={driving}
                  laps={lockedLaps}
                  seed={nextSeed}
                  sealed={sealedLaps}
                  driven={driven}
                  runOver={runOver}
                  late={Boolean(nextLap?.late)}
                  toBeat={room.kingScore}
                  holder={crownName}
                  timeUp={timeUp}
                  windowLeft={windowLeft}
                  canTake={canTake}
                  busy={busy}
                  error={shownError}
                  waitedSeconds={lapRun.sealedAt ? Math.max(0, Math.floor((now - lapRun.sealedAt) / 1000)) : null}
                  formatWait={formatWait}
                  onStartLap={() => {
                    setChainError(null);
                    setDriving(true);
                  }}
                  onDriven={onDriven}
                  onPick={onPick}
                  onLock={() => driven && void lockDriven(driven)}
                  onTake={() => void takeCrown()}
                  onLockAndTake={() => {
                    if (!driven) return;
                    setTakeAfterLock(true);
                    void lockDriven(driven);
                  }}
                  onLeave={() => {
                    setDriving(false);
                    setInRun(false);
                  }}
                />
              ) : null}
              {closeButton}
            </div>
          ) : null}

          {shownError ? <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{shownError}</p> : null}
          {busy && live && !(showPay && paying) ? <ChainLoader inline title={busy} /> : null}
          {room.seals[0] ? <VerifiedSeal seal={room.seals[0]} /> : null}
        </div>

        <aside className="relative z-10 space-y-6">
          {matchOver ? (
            <div className="rounded-2xl bg-ink-2 p-5">
              <h2 className="font-poster text-sm font-bold uppercase">Play another game</h2>
              {nextCrowns.length > 0 ? (
                <ul className="mt-4 space-y-2.5">
                  {nextCrowns.map((item) => (
                    <li key={item.id}>
                      <ArenaRailCard
                        href={`/play/${item.id}`}
                        eyebrow="Live"
                        title={item.title}
                        meta={`${ckbWhole(item.potShannons)} CKB prize · ${item.king ? `${item.king} · ${item.kingScore}` : 'no crown holder yet'}`}
                        cover={arenaCoverForSeed(item.id)}
                        cta="Enter"
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-mute">No other game is running right now.</p>
              )}
              <Button href="/create" size="sm" className="mt-4">
                Host your own
              </Button>
            </div>
          ) : null}
          {live && !matchOver ? (
            // Mid-match sharing: the link carries this round, so the preview shows today's score.
            <div>
              <InviteButton
                url={crownShareUrl(room)}
                title={room.title}
                text={room.kingScore > 0 ? `Beat ${room.kingScore} to take the crown on Crowns.` : `Take the crown on Crowns.`}
                variant="arena"
              />
            </div>
          ) : null}
          <section aria-labelledby="steals" className="rounded-2xl bg-ink-2 p-5">
            <h2 id="steals" className="font-poster text-sm font-bold uppercase">
              Activity
            </h2>
            {room.feed.length ? (
              <ol className="mt-4 space-y-2">
                {room.feed.slice(0, 8).map((item, index) => (
                  <li key={`${item.id}-${index}`} className={`flex items-center gap-3 rounded-xl p-2.5 ${index === 0 && item.good ? 'bg-gold/10' : ''}`}>
                    <Crown className={`h-4 w-4 shrink-0 ${item.good ? 'fill-gold text-gold' : 'text-mute'}`} aria-hidden="true" />
                    <p className={`flex-1 text-sm ${item.good ? 'text-white' : 'text-mute'}`}>{item.text}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-mute">No steals yet. The first run takes the crown.</p>
            )}
          </section>
        </aside>
      </section>
    </ArenaStage>
  );
}
