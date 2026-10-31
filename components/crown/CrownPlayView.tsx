'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Crown, Monitor, ShieldCheck, Timer } from 'lucide-react';
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
import { CrownReceipt } from '@/components/crown/CrownReceipt';
import { useCrown } from '@/components/crown/useCrown';
import { LaneRunnerGame, type FinishedRun, type LapPlan } from '@/components/game/LaneRunnerGame';
import { arenaCoverForSeed } from '@/lib/poster';
import { InviteButton } from '@/components/InviteButton';
import { HowToPlayIntro } from '@/components/explain/HowToPlayIntro';
import { LapPanel } from '@/components/crown/LapPanel';
import { ccc } from '@ckb-ccc/connector-react';
import { bytesToHex, ckbHash, hexToBytes, LAPS, runSeed, runSeedV1 } from '@/lib/sudden-death/codec';
import { loadLapRun, saveLapRun } from '@/lib/crown/my-laps';
import {
  bidRefundAt,
  closeCrown,
  entryLap,
  expireBid,
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
import { forgetBestRun, loadBestRun, saveBestRun } from '@/lib/crown/my-run';
import { deleteCrownRemote, fetchCrownList, joinCrownRemote, pushCrownState } from '@/lib/crown/remote';
import { useWallet } from '@/hooks/useWallet';
import { useMyLockHash } from '@/hooks/useMyLockHash';
import { useRequireUsername } from '@/hooks/useRequireUsername';
import { useAuth } from '@/context/auth-provider';
import { suddenDeathConfigured } from '@/lib/registry/config';
import { getCkbClient } from '@/lib/ckb/client';
import { isHostWallet } from '@/lib/crown/standing';
import { nowMs } from '@/lib/crown/clock';
import { gameStartAt, inEntryWindow } from '@/lib/crown/phase';
import {
  applySteal,
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

/**
 * Font size for a number in the pot / crown / clock row. As large as the design allows on a wide
 * screen; on a phone it shrinks with the number's length so it always fits a third of the row,
 * whether it is "0" or "1250000" or "47:59:59".
 */
function fitFont(text: string, maxRem: number): string {
  const chars = Math.max(3, text.length);
  return `min(${maxRem}rem, calc((100vw - 64px) / 3 / ${(chars * 0.82).toFixed(2)}))`;
}

/** Automatic resends after losing a same-moment race for the crown, before handing back to the player. */
const RESEND_LIMIT = 3;
/** A run sent this close to the end of the road's window might land after it, so the page stops offering it. */
const SEND_MARGIN_MS = 30_000;

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
  return message;
}

/** A practice course for a crown with no match cell, or a visitor with no wallet. */
function floorSeed(roomId: string, who: string): bigint {
  const encode = (text: string) => new TextEncoder().encode(text);
  return runSeedV1(ckbHash([encode(roomId)]), ckbHash([encode(who || 'guest')]));
}

export function CrownPlayView({ id }: { id: string }) {
  const router = useRouter();
  const { room, seats, ready, unreachable } = useCrown(id);
  // A connected wallet with no username is sent to /join and comes back here after claiming one.
  const named = useRequireUsername();
  const [kingPicture] = useChainPictures([room?.kingHash]);
  const { address, formattedAddress, isConnected } = useWallet();
  const { ensureAuth, authenticated } = useAuth();
  const signer = ccc.useSigner();
  const chain = suddenDeathConfigured();
  const [busy, setBusy] = useState<string | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);
  const myLockHash = useMyLockHash();
  // Live crowns to play next. Only fetched once this crown is over; during a match the page keeps
  // players here.
  const [nextCrowns, setNextCrowns] = useState<CrownRoom[]>([]);
  const [committed, setCommitted] = useState<{ txHash: string; ok: boolean } | null>(null);
  // The chain's median time and when this page read it, so the wait can count down between reads.
  const [median, setMedian] = useState<{ at: number; readAt: number } | null>(null);
  const [bestRun, setBest] = useState<FinishedRun | null>(null);
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

  // A live match is ready once its newest transaction is committed. Without a chain there is
  // nothing to wait for; a crown that is not live has no match to wait on.
  const matchTx = chain && room?.status === 'live' ? room.matchOutPoint?.txHash ?? null : null;
  const matchReady = matchTx ? committed?.txHash === matchTx && committed.ok : !chain;
  // Only a confirmed "not yet" counts as waiting. Before the first answer arrives the page does not
  // know, and showing a wait then flashes a timer on every page load.
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
  // Reading starts the moment the on-screen clock hits zero, not only when the page loads after it.
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

  // Once the chain allows a close, every open page sends one, so a crown pays out without anyone
  // pressing a button or signing anything. The king has the most to lose, so their page goes
  // first; the others wait a little and only send if the crown is still open by then.
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

  const seatBid = room ? seats.find((seat) => seat.address === address.trim().toLowerCase())?.bidOutPoint ?? null : null;
  const savedBid = room ? rememberedBid(room.id, address) : null;
  const entryBid = room?.bidOutPoint ?? seatBid ?? savedBid;

  // The run, lap by lap. Each lap's road is hidden until the chain hands it out: lap 1 when the
  // entry lands, each later lap once the lap before it is sealed. The entry moves with every seal,
  // so this follows its current out point; until the next lap appears the player is at the pit stop.
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
      if (next) setLapFound({ entry: entryKey, next });
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
  const nextLap = lapFound && lapFound.entry === entryKey ? lapFound.next : null;

  // This browser's run: the session key that seals its laps and every lap sealed so far.
  const [runVersion, setRunVersion] = useState(0);
  const roomKey = room?.id ?? null;
  const lapRun = useMemo(
    () => (roomKey && address && typeof window !== 'undefined' ? loadLapRun(roomKey, address) : null),
    // runVersion re-reads storage after a seal or a new entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomKey, address, runVersion],
  );
  const sealedLaps = useMemo(() => lapRun?.laps ?? [], [lapRun]);
  const runOver = sealedLaps.length >= LAPS || Boolean(sealedLaps.at(-1)?.crashed);
  // The chain and this browser agree on how many laps are sealed.
  const inSync = !nextLap || nextLap.sealed === sealedLaps.length;
  const lapPlan = useMemo<LapPlan | null>(() => {
    if (!matchIdForRoad || !myLockHash || !nextLap || nextLap.late || !lapRun || !inSync || runOver) return null;
    return {
      seeds: [...sealedLaps.map((lap) => runSeed(matchIdForRoad, myLockHash, lap.block)), nextLap.seed],
      sealed: sealedLaps.map((lap) => hexToBytes(lap.tape)),
    };
  }, [matchIdForRoad, myLockHash, nextLap, lapRun, inSync, runOver, sealedLaps]);
  // A run that can no longer be sent (its window shut, or the game ended) gives its key cell back.
  // The laps stay remembered so the panel can still show them.
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

  // The best try at the lap being played. Only the lap's own moves are sealed.
  // A crashed try only matters while it beats the best clean one: sealing it ends the run.
  const [lapTry, setLapTry] = useState<{ lap: number; clean: FinishedRun | null; crash: FinishedRun | null } | null>(null);
  const [stamp, setStamp] = useState<{ lap: number; at: number } | null>(null);

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

  const seed = useMemo(() => {
    if (!room) return null;
    if (chain && room.matchId && myLockHash) {
      return lapPlan ? lapPlan.seeds.at(-1)! : floorSeed(`${room.id}:practice`, myLockHash);
    }
    return floorSeed(room.id, address.trim().toLowerCase());
  }, [room, chain, myLockHash, address, lapPlan]);

  // The best finished run counts only on the course it was played on. A new course (another
  // wallet, the match cell arriving) starts the player over.
  // A run played before leaving the page (to Watch, say) is still here when the player comes back.
  const roomId = room?.id ?? null;
  const storedBest = useMemo(
    () => (roomId && seed != null && typeof window !== 'undefined' ? loadBestRun(roomId, seed) : null),
    [roomId, seed],
  );
  const fresh = bestRun && seed != null && bestRun.seed === seed ? bestRun : null;
  const best = fresh && (!storedBest || fresh.score >= storedBest.score) ? fresh : storedBest;
  const lapIndex = lapPlan ? lapPlan.sealed.length + 1 : null;
  const onFinish = useCallback(
    (run: FinishedRun) => {
      if (lapIndex != null) {
        // A lap try: keep the best one for this lap until the player seals it.
        setLapTry((current) => {
          const tries = current && current.lap === lapIndex ? current : { lap: lapIndex, clean: null, crash: null };
          let { clean, crash } = tries;
          if (run.crashed) {
            if (!crash || run.score > crash.score) crash = run;
          } else if (!clean || run.score > clean.score) {
            clean = run;
          }
          if (crash && clean && crash.score <= clean.score) crash = null;
          return clean === tries.clean && crash === tries.crash ? tries : { lap: lapIndex, clean, crash };
        });
        return;
      }
      setBest((current) => {
        const keep = current && current.seed === run.seed && current.score >= run.score ? current : run;
        if (roomId && keep === run) {
          const saved = loadBestRun(roomId, run.seed);
          if (!saved || run.score > saved.score) saveBestRun(roomId, run);
        }
        return keep;
      });
    },
    [roomId, lapIndex],
  );

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

  if (room.legacy) {
    return (
      <ArenaStage backHref="/play" backLabel="Crowns">
        <EmptyState title="Old game" body="A quiz crown from before the game update. It can no longer be played." action={<Button href="/play">Find a crown</Button>} />
      </ArenaStage>
    );
  }

  // The chain records the king as a lock hash; compare against ours. The full lock, when the
  // server has it, is a fallback for rooms saved before the hash was recorded.
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
  // Between reads the median keeps moving at about wall-clock speed, so the wait counts down every second.
  const sinceWait =
    median != null && room.deadlineAt != null ? Math.max(0, room.deadlineAt - (median.at + (now - median.readAt))) : null;
  const shownError = !matchReady && chainError && /not on chain yet|still confirming/i.test(chainError) ? null : chainError;
  const onChain = chain && Boolean(room.matchId);
  // On chain the run is played in laps on an entry; the score is the run's score after its last sealed lap.
  const lapMode = onChain && Boolean(entryBid);
  const runScore = sealedLaps.at(-1)?.score ?? 0;
  const beats = lapMode ? sealedLaps.length > 0 && runScore > room.kingScore : best != null && best.score > room.kingScore;
  // Time up means time up. The chain can only enforce "not before", so a better run would still
  // be accepted until someone closes; the app stops offering it the moment the clock hits zero.
  const timeUp = live && room.deadlineAt != null && !clock.counting;
  const roadLeft = nextLap ? nextLap.windowEndsMs - now : null;
  const roadOpen = roadLeft != null && roadLeft > SEND_MARGIN_MS;
  const canTake =
    live && !entryWindow && !timeUp && beats && !iHold && isConnected && (!onChain || (matchReady && inSync && roadOpen)) && !busy;
  const currentLap = sealedLaps.length + 1;
  const stamping = stamp != null && now - stamp.at < 2_600;

  async function lockEntry(current: CrownRoom): Promise<CrownRoom> {
    if (!signer) throw new Error('Connect your wallet to pay the entry.');
    // A throwaway key for this run: it seals each lap without asking the wallet.
    if (lapRun && !lapRun.keyReturned) {
      setBusy('Returning your last run’s key cell…');
      // Best effort: a key cell too small to stand alone under the owner’s lock can’t go back by itself.
      await returnKeyCell(signer.client, lapRun.session as `0x${string}`, (await signer.getRecommendedAddressObj()).script).catch(
        () => null,
      );
    }
    const session = await newSessionKey(signer.client);
    const next = await lockBid(signer, current, session, setBusy);
    if (address) {
      saveLapRun(current.id, address, { session: session.secret, laps: [] });
      setRunVersion((version) => version + 1);
      setLapTry(null);
    }
    saveCrown(next);
    if (address && next.bidOutPoint) {
      rememberBid(current.id, address, next.bidOutPoint);
      void joinCrownRemote(current.id, {
        address,
        displayName: formattedAddress || 'Player',
        bidOutPoint: next.bidOutPoint,
      }).catch(() => undefined);
    }
    return next;
  }

  /** The entry moved (a seal spends it and makes it again): remember where it is now, everywhere. */
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

  async function sealCurrentLap(kind: 'clean' | 'crash') {
    const chosen = lapTry?.lap === sealedLaps.length + 1 ? lapTry[kind] : null;
    if (!room || !address || !nextLap || !chosen || !lapRun) return;
    setChainError(null);
    const lap = sealedLaps.length + 1;
    setBusy(`Sealing lap ${lap}…`);
    try {
      const point = await sealLap(getCkbClient(), nextLap.point, lapRun.session as `0x${string}`, chosen.tape, setBusy);
      saveLapRun(room.id, address, {
        ...lapRun,
        laps: [...lapRun.laps, { block: nextLap.block, tape: bytesToHex(chosen.tape), score: chosen.score, crashed: chosen.crashed }],
        sealedAt: Date.now(),
      });
      moveEntry(point);
      setRunVersion((version) => version + 1);
      setLapTry(null);
      setStamp({ lap, at: Date.now() });
    } catch (error) {
      setChainError(chainMessage(error, 'The lap could not be sealed.'));
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
    if (!room || (!lapMode && !best)) return;
    setChainError(null);
    try {
      await ensureAuth();
    } catch (error) {
      setChainError(error instanceof Error ? error.message : 'Sign in with your wallet to play.');
      return;
    }
    const name = formattedAddress || 'Player';
    if (!chain || !room.matchId) {
      if (!best) return;
      const next = applySteal(room, best.score, name, `Run of ${best.tape.length / 3} moves (practice floor)`);
      saveCrown(next);
      void pushCrownState(next).catch(() => undefined);
      setBest(null);
      return;
    }
    if (!signer) {
      setChainError('Connect your wallet. You only sign once, to pay the entry.');
      return;
    }
    try {
      let current = loadCrown(id) ?? room;
      if (nextLap) current = { ...current, bidOutPoint: nextLap.point };
      else if (!current.bidOutPoint && entryBid) current = { ...current, bidOutPoint: entryBid };
      if (!current.bidOutPoint || sealedLaps.length === 0) {
        setChainError('Pay to enter and seal at least one lap first.');
        return;
      }
      setBusy('Sending your run…');
      const run = {
        laps: sealedLaps.map((lap) => ({ block: hexToBytes(lap.block), tape: hexToBytes(lap.tape) })),
        score: runScore,
      };
      const client = signer.client;
      // Sends the run, and if another player's steal got there in the same few seconds, sends it
      // again on top of their round. The chain re-checks every try, so a resend can only win what
      // the run still earns: once it no longer beats the crown, stealCrown says so and this stops.
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
        // The entry this phone remembered was used by an earlier steal (or never landed). A run only
        // counts on the road its own entry revealed, so a new entry means playing a new road.
        forgetEntry();
        throw new Error('That entry was already used. Pay a new entry for a new road.');
      }
      const named = { ...result.room, king: name };
      if (address) forgetBid(room.id, address);
      if (best) forgetBestRun(room.id, best.seed);
      // The run is over. Its session key is kept until the key cell is back with the player.
      if (address && lapRun) saveLapRun(room.id, address, { ...lapRun, finished: true });
      setRunVersion((version) => version + 1);
      saveCrown(named);
      void pushCrownState(named).catch(() => undefined);
      if (address) {
        void joinCrownRemote(room.id, { address, displayName: name, clearBid: true }).catch(() => undefined);
      }
      setBest(null);
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
      setChainError(error instanceof Error ? error.message : 'The lobby could not be deleted.');
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

  const closeButton =
    chain && room.matchId && live && !confirmingOpen ? (
      <div className="clip-panel mt-4 bg-gold/10 p-6">
        <Button variant="gold" size="lg" onClick={() => void closeMatch()} disabled={Boolean(busy) || clock.counting || (medianAt != null && !sinceReady)}>
          {busy === 'Closing…' ? busy : 'End the game and pay the winner'}
        </Button>
        <p className="mt-3 text-sm text-mute">
          {clock.counting
            ? 'You can end it once the clock runs out.'
            : sinceReady || medianAt == null
              ? 'No wallet needed. The prize goes to the last player who grabbed the crown in time.'
              : sinceWait != null && sinceWait > 0
                ? `Opens in about ${formatWait(sinceWait)}.`
                : 'Opening now…'}
        </p>
      </div>
    ) : null;

  return (
    <ArenaStage backHref="/play" backLabel="Crowns">
      {room.status !== 'settled' ? <HowToPlayIntro /> : null}
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
        <div className="flex flex-wrap gap-2">
          <Button href={`/watch/${room.id}`} variant="outline" size="sm">
            <Monitor className="h-4 w-4" aria-hidden="true" /> Big screen
          </Button>
          {iHost && live ? (
            <Button href={`/host/${room.id}`} variant="outline" size="sm">
              <Crown className="h-4 w-4" aria-hidden="true" /> Your game
            </Button>
          ) : null}
          {room.matchOutPoint ? (
            <Button href={`/verify/${room.matchOutPoint.txHash}`} variant="outline" size="sm">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Check it
            </Button>
          ) : null}
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
                      <p className="text-[11px] text-mute">Crown holder</p>
                      <p className="truncate font-poster text-base font-bold">{iHold ? 'You' : room.king}</p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-mute">Nobody holds it yet.</p>
                )}
              </div>
              <div className="rounded-2xl bg-ink p-4">
                <p className="text-[11px] text-mute">Score to beat</p>
                <p className="font-poster text-3xl font-black tabular-nums">{room.kingScore || '—'}</p>
                <p className="font-mono text-[10px] text-mute">+{ckbWhole(room.feeShannons)} CKB into the pot per crown</p>
              </div>
            </div>
          </section>

          {confirmingOpen ? (
            <div className="clip-panel bg-ink-2">
              <ChainLoader compact title={`Setting up the game on chain · ${formatWait(now - (room.openedAt ?? now))}`} note="Usually 20 to 90 seconds. Practise meanwhile." />
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
              {room.matchOutPoint ? (
                <>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button href={`/verify/${room.matchOutPoint.txHash}`} variant="pink">
                      Check this crown
                    </Button>
                    <Button href="/play" variant="ghost">
                      Find another crown
                    </Button>
                  </div>
                  <CrownReceipt room={room} youWon={iHold} />
                </>
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

          {live && seed != null ? (
            <div>
              <LaneRunnerGame
                title={room.title}
                seed={seed}
                toBeat={room.kingScore}
                onFinish={onFinish}
                startLabel={lapPlan && roadOpen && !entryWindow ? `Race lap ${currentLap} of ${LAPS}` : 'Practise'}
                lap={lapPlan && !entryWindow ? lapPlan : undefined}
              />
              {stamping ? (
                <div className="pointer-events-none relative z-20 -mt-40 mb-16 flex justify-center" aria-live="polite">
                  <div className="lap-stamp clip-sm bg-lime px-6 py-3 text-center text-ink shadow-[0_0_40px_rgba(153,238,45,0.35)]">
                    <p className="font-poster text-3xl font-black uppercase leading-none">Lap {stamp!.lap} sealed</p>
                    <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-wider text-ink/70">on chain · no wallet needed</p>
                  </div>
                </div>
              ) : null}
              <div className="clip-panel mt-4 bg-ink-2 p-6">
                {entryWindow ? (
                  <>
                    <p className="font-mono text-[11px] uppercase tracking-wider text-lime">{entryBid ? 'You’re in' : 'Entry open'}</p>
                    <p className="mt-2 font-poster text-xl font-black uppercase">{entryBid ? 'Drive 5 laps' : 'Pay to enter'}</p>
                    <p className="mt-1 max-w-xl text-sm text-mute">
                      The round starts for everyone together. Lock your entry now.
                    </p>
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-lime">
                      {seats.filter((seat) => seat.bidOutPoint).length} locked · {seats.length} seated
                    </p>
                  </>
                ) : iHold ? (
                  <div className="-m-6 flex items-start justify-between gap-4 bg-gold p-6 text-ink">
                    <div>
                      <p className="font-mono text-[11px] font-bold uppercase tracking-wider">You hold the crown</p>
                      <p className="mt-2 font-poster text-2xl font-black uppercase md:text-3xl">Hold it till zero</p>
                      <p className="mt-1 font-medium">
                        Your score {room.kingScore} is the one to beat. {clockText} to go. If someone beats it, take it back.
                      </p>
                    </div>
                    <Crown className="h-12 w-12 shrink-0 -rotate-6 fill-ink" aria-hidden="true" />
                  </div>
                ) : lapMode ? (
                  <LapPanel
                    laps={sealedLaps.map((lap) => ({ score: lap.score, crashed: lap.crashed }))}
                    current={currentLap}
                    cleanScore={lapTry?.lap === currentLap ? (lapTry.clean?.score ?? null) : null}
                    crashScore={lapTry?.lap === currentLap ? (lapTry.crash?.score ?? null) : null}
                    toBeat={room.kingScore}
                    runOver={runOver}
                    pitStop={!nextLap || !inSync ? (sealedLaps.length ? 'seal' : 'entry') : null}
                    otherDevice={!lapRun}
                    waitedSeconds={lapRun?.sealedAt ? Math.max(0, Math.floor((now - lapRun.sealedAt) / 1000)) : null}
                    windowLeft={roadLeft != null ? Math.max(0, roadLeft - SEND_MARGIN_MS) : null}
                    busy={Boolean(busy)}
                    onSeal={(kind) => void sealCurrentLap(kind)}
                    formatWait={formatWait}
                  />
                ) : best ? (
                  <>
                    <p className="font-mono text-[11px] uppercase tracking-wider text-lime">Your best run</p>
                    <p className="mt-2 font-poster text-3xl font-black tabular-nums">
                      {best.score} <span className="text-xl text-mute">vs {room.kingScore}</span>
                    </p>
                    <p className="mt-2 max-w-xl text-sm text-mute">
                      {beats
                        ? `That beats the crown! Grab it: ${ckbWhole(room.feeShannons)} CKB goes into the prize.`
                        : onChain
                          ? 'Not enough yet. Keep trying while your road is open.'
                          : 'Not enough yet. Your road is the same every time, so you can learn it.'}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-mute">
                    {room.kingScore ? `Practice is free. Beat ${room.kingScore} to take the crown.` : 'Practice is free. Be the first to finish and the crown is yours.'}
                  </p>
                )}
                {!isConnected ? (
                  <div className="mt-4">
                    <ArenaCta onClick={() => void ensureAuth().catch(() => undefined)}>Connect to play for the prize</ArenaCta>
                  </div>
                ) : null}
                {onChain && live && !timeUp && !entryWindow && !iHold && !entryBid ? (
                  <p className="mt-3 text-sm text-mute">
                    {`This is a practice road. Pay to enter and the chain hands you your real run, ${LAPS} laps of 24 seconds, each lap’s road revealed only once the lap before it is sealed.`}
                  </p>
                ) : null}
                {cellMoving ? (
                  <div className="mt-3">
                    <ChainLoader inline title={iHold ? 'Your grab is landing on chain…' : 'Someone just grabbed the crown. Updating…'} />
                  </div>
                ) : null}
                {timeUp ? (
                  <p className="mt-3 rounded-xl bg-gold/10 p-3 text-sm text-gold">
                    Time&apos;s up. {room.king ? `${iHold ? 'You hold' : `${room.king} holds`} the crown at ${room.kingScore}.` : 'Nobody took the crown.'}
                  </p>
                ) : null}
                {beats && !entryWindow && !timeUp && !iHold && isConnected && (!onChain || lapMode) && !(roadLeft != null && !roadOpen) ? (
                  <div className="mt-4">
                    <ArenaCta onClick={() => void takeCrown()} disabled={!canTake}>
                      {busy ??
                        (lapMode && (!nextLap || !inSync)
                          ? `Grab with ${runScore} once your seal lands…`
                          : `Grab the crown with ${lapMode ? runScore : best?.score}`)}
                    </ArenaCta>
                    {lapMode && !runOver ? (
                      <p className="mt-2 text-xs text-mute">Grabbing now ends your run with the laps sealed so far.</p>
                    ) : null}
                  </div>
                ) : null}
                {onChain && live && !timeUp && !iHold && isConnected && matchReady && (!entryBid || (nextLap && inSync && !roadOpen)) ? (
                  <div className="mt-4">
                    <ArenaCta
                      onClick={() => {
                        setBusy('Paying your entry…');
                        setChainError(null);
                        // A spent road's entry is still refunded at the close; this one gets a new road.
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
                      {busy ?? (entryBid ? 'Pay a new entry' : 'Pay to enter')}
                    </ArenaCta>
                  </div>
                ) : null}
              </div>
              {closeButton}
            </div>
          ) : null}

          {shownError ? <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{shownError}</p> : null}
          {busy && live ? <ChainLoader inline title={busy} /> : null}
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
              Crown steals
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
