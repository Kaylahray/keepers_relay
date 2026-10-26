'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { ArenaRailCard, ArenaStage } from '@/components/arena/ArenaStage';
import { leftMs, playClock, useNow } from '@/components/crown/BleedingClock';
import { VerifiedSeal } from '@/components/crown/VerifiedSeal';
import { CrownLobby } from '@/components/crown/CrownLobby';
import { CrownReceipt } from '@/components/crown/CrownReceipt';
import { useCrown } from '@/components/crown/useCrown';
import { LaneRunnerGame, type FinishedRun } from '@/components/game/LaneRunnerGame';
import { arenaCoverForSeed } from '@/lib/poster';
import { InviteButton } from '@/components/InviteButton';
import { HowToPlayIntro } from '@/components/explain/HowToPlayIntro';
import { ccc } from '@ckb-ccc/connector-react';
import { ckbHash, runSeed } from '@/lib/sudden-death/codec';
import {
  bidRefundAt,
  closeCrown,
  expireBid,
  lockBid,
  EntryGoneError,
  isLostRace,
  MatchMovedError,
  openMatch,
  RunBeatenError,
  stealCrown,
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
  return runSeed(ckbHash([encode(roomId)]), ckbHash([encode(who || 'guest')]));
}

export function CrownPlayView({ id }: { id: string }) {
  const router = useRouter();
  const { room, seats, ready, unreachable } = useCrown(id);
  // A connected wallet with no username is sent to /join and comes back here after claiming one.
  const named = useRequireUsername();
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
    if (chain && room.matchId && myLockHash) return runSeed(room.matchId, myLockHash);
    return floorSeed(room.id, address.trim().toLowerCase());
  }, [room, chain, myLockHash, address]);

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
  const onFinish = useCallback(
    (run: FinishedRun) => {
      setBest((current) => {
        const keep = current && current.seed === run.seed && current.score >= run.score ? current : run;
        if (roomId && keep === run) {
          const saved = loadBestRun(roomId, run.seed);
          if (!saved || run.score > saved.score) saveBestRun(roomId, run);
        }
        return keep;
      });
    },
    [roomId],
  );

  if (!ready) {
    return (
      <ArenaStage>
        <p className="text-sm text-white/50">Loading the game…</p>
      </ArenaStage>
    );
  }

  if (isConnected && !named.ready) {
    return (
      <ArenaStage>
        {named.username && !authenticated ? (
          <>
            <p className="text-sm text-white/60">Sign in as @{named.username} to join this crown.</p>
            <ArenaCta onClick={() => void ensureAuth().catch(() => undefined)} className="mt-4">
              Sign in
            </ArenaCta>
          </>
        ) : (
          <p className="text-sm text-white/50">Checking your username…</p>
        )}
      </ArenaStage>
    );
  }

  if (!room) {
    return (
      <ArenaStage backHref="/play" backLabel="Crowns">
        <h1 className="font-poster text-5xl uppercase text-white">{unreachable ? 'Connection lost' : 'Game not found'}</h1>
        <p className="mt-3 text-sm text-white/55">
          {unreachable ? 'Could not reach this game. Retrying…' : 'This game does not exist or was deleted.'}
        </p>
      </ArenaStage>
    );
  }

  if (room.legacy) {
    return (
      <ArenaStage backHref="/play" backLabel="Crowns">
        <h1 className="font-poster text-5xl uppercase text-white">Old game</h1>
        <p className="mt-3 max-w-md text-sm text-white/55">
          A quiz crown from before the game update. It can no longer be played.
        </p>
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
  const beats = best != null && best.score > room.kingScore;
  // Time up means time up. The chain can only enforce "not before", so a better run would still
  // be accepted until someone closes; the app stops offering it the moment the clock hits zero.
  const timeUp = live && room.deadlineAt != null && !clock.counting;
  const canTake =
    live && !entryWindow && !timeUp && beats && !iHold && isConnected && (!chain || !room.matchId || matchReady) && !busy;

  async function lockEntry(current: CrownRoom): Promise<CrownRoom> {
    if (!signer) throw new Error('Connect your wallet to pay the entry.');
    const next = await lockBid(signer, current);
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
    if (!room || !best) return;
    setChainError(null);
    try {
      await ensureAuth();
    } catch (error) {
      setChainError(error instanceof Error ? error.message : 'Sign in with your wallet to play.');
      return;
    }
    const name = formattedAddress || 'Player';
    if (!chain || !room.matchId) {
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
      if (!current.bidOutPoint && entryBid) current = { ...current, bidOutPoint: entryBid };
      if (!current.bidOutPoint) {
        setBusy('Paying your entry…');
        current = await lockEntry(current);
      }
      setBusy('Sending your run…');
      const run = { tape: best.tape, score: best.score };
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
        // The entry this phone remembered was used by an earlier steal (or never landed). Forget it
        // everywhere it was kept, lock a fresh one, and send the same run once more.
        forgetEntry();
        setBusy('Paying a new entry…');
        current = await lockEntry({ ...current, bidOutPoint: null });
        setBusy('Sending your run…');
        result = await send(current);
      }
      const named = { ...result.room, king: name };
      if (address) forgetBid(room.id, address);
      forgetBestRun(room.id, best.seed);
      saveCrown(named);
      void pushCrownState(named).catch(() => undefined);
      if (address) {
        void joinCrownRemote(room.id, { address, displayName: name, clearBid: true }).catch(() => undefined);
      }
      setBest(null);
    } catch (error) {
      if (error instanceof MatchMovedError) saveCrown(error.room);
      if (error instanceof RunBeatenError) {
        setChainError(error.message);
      } else {
        setChainError(chainMessage(error, 'The run could not be sent.'));
      }
    } finally {
      setBusy(null);
    }
  }

  async function closeMatch() {
    if (!room) return;
    if (!signer) {
      setChainError('Connect a wallet to end the game.');
      return;
    }
    setBusy('Closing…');
    setChainError(null);
    try {
      const result = await closeCrown(signer, loadCrown(id) ?? room);
      saveCrown(result.room);
      void pushCrownState(result.room).catch(() => undefined);
    } catch (error) {
      if (error instanceof MatchMovedError) saveCrown(error.room);
      setChainError(chainMessage(error, 'The close failed.'));
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
    chain && room.matchId && live && !confirmingOpen && isConnected ? (
      <div className="mt-4">
        <button
          type="button"
          onClick={() => void closeMatch()}
          disabled={Boolean(busy) || clock.counting || (medianAt != null && !sinceReady)}
          className="bg-[#e1bf47] px-5 py-3 font-poster text-2xl uppercase leading-none text-[#111] disabled:opacity-40"
        >
          {busy === 'Closing…' ? busy : 'End the game and pay the winner'}
        </button>
        <p className="mt-2 text-sm text-white/55">
          {clock.counting
            ? 'You can end it once the clock runs out.'
            : sinceReady || medianAt == null
              ? 'The prize goes to whoever holds the crown.'
              : sinceWait != null && sinceWait > 0
                ? `Opens in about ${formatWait(sinceWait)}.`
                : 'Opening now…'}
        </p>
      </div>
    ) : null;

  return (
    <ArenaStage backHref="/play" backLabel="Crowns">
      {room.status !== 'settled' ? <HowToPlayIntro /> : null}
      <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
        <div className="relative z-10 min-w-0 pb-6">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
            {room.title} · {GAMES[room.game].title}
          </p>
          {/* Three fixed columns that never wrap: a ticking clock changing width must not reflow the page. */}
          <div className="mt-4 grid grid-cols-3 items-end gap-3 sm:gap-6">
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">Prize</p>
              <p
                className="whitespace-nowrap font-poster uppercase leading-none tabular-nums text-[#99ee2d]"
                style={{ fontSize: fitFont(potText, 3.75) }}
              >
                {potText}
              </p>
              <p className="font-mono text-[11px] uppercase text-white/45">CKB</p>
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">Best score</p>
              <p
                className="whitespace-nowrap font-poster uppercase leading-none tabular-nums text-[#e1bf47]"
                style={{ fontSize: fitFont(String(room.kingScore), 2.25) }}
              >
                {room.kingScore}
              </p>
              <p className="truncate font-mono text-[11px] uppercase text-white/45">
                {room.king ? `${iHold ? 'you' : room.king}` : 'nobody yet'}
              </p>
            </div>
            <div className="min-w-0 text-right">
              <p className="truncate font-mono text-[10px] font-bold uppercase text-white/40">
                {entryWindow ? 'Starts in' : clock.counting ? 'Time left' : live ? 'Time up' : 'Closed'}
              </p>
              <p
                className={`whitespace-nowrap font-poster uppercase leading-none tabular-nums ${!entryWindow && panic ? 'text-[#af2a3a]' : 'text-white'}`}
                style={{ fontSize: fitFont(clockText, 2.25) }}
              >
                {clockText}
              </p>
              <p className="truncate font-mono text-[11px] uppercase text-white/45">+{ckbWhole(room.feeShannons)} CKB a crown</p>
            </div>
          </div>
          {live ? (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full ${panic ? 'bg-[#af2a3a]' : 'bg-gradient-to-r from-[#ff56f6] to-[#406aff]'}`}
                style={{ width: `${clockProgress}%` }}
              />
            </div>
          ) : null}

          {confirmingOpen ? (
            <div className="mt-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">Setting up the game on chain</p>
              <h1 className="mt-2 font-poster text-6xl uppercase leading-none text-[#99ee2d] sm:text-7xl">
                {formatWait(now - (room.openedAt ?? now))}
              </h1>
              <p className="mt-4 max-w-md text-base font-light leading-relaxed text-white/70">
                Opening the match on chain, usually 20 to 90 seconds. Practise meanwhile.
              </p>
            </div>
          ) : null}

          {room.status === 'settled' ? (
            <div className="mt-6">
              <h1 className="font-poster text-[clamp(2.75rem,6vw,4.5rem)] uppercase leading-[0.92] text-white">Closed</h1>
              <p className="mt-4 max-w-md text-base font-light leading-relaxed text-white/60">
                {room.king
                  ? `${ckbWhole(room.potShannons)} CKB went to ${iHold ? 'you' : room.king}, who held the crown at ${room.kingScore}.`
                  : 'Nobody grabbed the crown, so the host got everything back.'}
              </p>
              {room.matchOutPoint ? (
                <>
                  <Link
                    href={`/verify/${room.matchOutPoint.txHash}`}
                    className="mt-5 inline-block border border-[#99ee2d] px-5 py-3 font-poster text-xl uppercase leading-none text-[#99ee2d] hover:bg-[#99ee2d]/10"
                  >
                    See how it was won →
                  </Link>
                  <CrownReceipt room={room} youWon={iHold} />
                </>
              ) : null}
              {chain && entryBid && refund.at != null && !refund.sent ? (
                <div className="mt-6 border border-white/10 bg-white/5 p-4">
                  <p className="text-sm text-white/70">
                    Unused entry.{' '}
                    {now >= refund.at ? 'You can take it back now.' : `Returnable after ${new Date(refund.at).toLocaleTimeString()}.`}
                  </p>
                  <button
                    type="button"
                    onClick={() => void returnEntry()}
                    disabled={Boolean(busy) || now < refund.at}
                    className="mt-3 border border-[#99ee2d] px-4 py-2 font-mono text-[11px] uppercase text-[#99ee2d] disabled:opacity-40"
                  >
                    {busy === 'Getting your entry back…' ? busy : 'Get my entry back'}
                  </button>
                </div>
              ) : null}
              {refund.sent ? <p className="mt-4 text-sm text-[#99ee2d]">Entry returned · {refund.sent.slice(0, 18)}…</p> : null}
            </div>
          ) : null}

          {live && seed != null ? (
            <div className="mt-6">
              <LaneRunnerGame
                seed={seed}
                toBeat={room.kingScore}
                onFinish={onFinish}
                startLabel={entryWindow ? 'Practise' : iHold ? 'Practise' : 'Race for the crown'}
              />
              <div className="mt-4 border border-white/10 bg-white/5 p-4">
                {entryWindow ? (
                  <>
                    <p className="font-poster text-2xl uppercase leading-none text-white">{entryBid ? 'You are in' : 'Pay to enter'}</p>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/65">
                      The round starts for everyone together. Lock your entry now.
                    </p>
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#99ee2d]">
                      {seats.filter((seat) => seat.bidOutPoint).length} locked · {seats.length} seated
                    </p>
                  </>
                ) : iHold ? (
                  <p className="text-sm text-white/70">
                    You hold the crown at {room.kingScore}. If someone beats it, take it back.
                  </p>
                ) : best ? (
                  <>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">Your best run</p>
                    <p className="mt-1 font-poster text-4xl uppercase leading-none text-white">
                      {best.score} <span className="text-2xl text-white/40">vs {room.kingScore}</span>
                    </p>
                    <p className="mt-2 max-w-xl text-sm text-white/65">
                      {beats
                        ? `That beats the crown! Grab it: ${ckbWhole(room.feeShannons)} CKB goes into the prize.`
                        : 'Not enough yet. Your road is the same every time, so you can learn it.'}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-white/65">
                    Practice is free. Beat {room.kingScore} to take the crown.
                  </p>
                )}
                {!isConnected ? (
                  <div className="mt-4">
                    <ArenaCta onClick={() => void ensureAuth().catch(() => undefined)}>Connect to play for the prize</ArenaCta>
                  </div>
                ) : null}
                {cellMoving ? (
                  <p className="mt-3 text-sm text-white/60">Someone just grabbed the crown. Updating…</p>
                ) : null}
                {timeUp ? (
                  <p className="mt-3 text-sm text-[#e1bf47]">
                    Time&apos;s up. {room.king ? `${iHold ? 'You hold' : `${room.king} holds`} the crown at ${room.kingScore}.` : 'Nobody took the crown.'}
                  </p>
                ) : null}
                {beats && !entryWindow && !timeUp && !iHold && isConnected ? (
                  <div className="mt-4">
                    <ArenaCta onClick={() => void takeCrown()} disabled={!canTake}>
                      {busy ?? (entryBid || !chain || !room.matchId ? `Grab the crown with ${best?.score}` : `Pay to enter and grab the crown`)}
                    </ArenaCta>
                  </div>
                ) : null}
                {entryWindow && chain && room.matchId && isConnected && matchReady && !entryBid ? (
                  <div className="mt-4">
                    <ArenaCta
                      onClick={() => {
                        setBusy('Paying your entry…');
                        setChainError(null);
                        void lockEntry(loadCrown(id) ?? room)
                          .catch((error: unknown) => {
                            if (error instanceof MatchMovedError) saveCrown(error.room);
                            setChainError(chainMessage(error, 'The entry payment failed.'));
                          })
                          .finally(() => setBusy(null));
                      }}
                      disabled={Boolean(busy)}
                    >
                      {busy ?? 'Pay to enter'}
                    </ArenaCta>
                  </div>
                ) : null}
              </div>
              {closeButton}
            </div>
          ) : null}

          {shownError ? <p className="mt-4 max-w-md text-sm text-[#af2a3a]">{shownError}</p> : null}
          {busy && live ? <p className="mt-3 font-mono text-[10px] uppercase text-white/50">{busy}</p> : null}
          <div className="mt-6 flex gap-4">
            <Link href={`/watch/${room.id}`} className="border-b border-[#bef970] pb-1 text-sm font-bold uppercase text-white">
              Watch →
            </Link>
            {iHost && live ? (
              <Link href={`/host/${room.id}`} className="border-b border-[#e1bf47] pb-1 text-sm font-bold uppercase text-[#e1bf47]">
                Your game →
              </Link>
            ) : null}
          </div>
          {room.seals[0] ? (
            <div className="mt-4">
              <VerifiedSeal seal={room.seals[0]} />
            </div>
          ) : null}
          {room.matchOutPoint ? (
            <Link
              href={`/verify/${room.matchOutPoint.txHash}`}
              className="mt-4 inline-block font-mono text-[10px] uppercase tracking-wider text-white/40 underline decoration-white/20 hover:text-[#99ee2d]"
            >
              Check this crown yourself
            </Link>
          ) : null}
        </div>

        <aside className="relative z-10 border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          {matchOver ? (
            <div className="mb-6 border-b border-white/10 pb-6">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#99ee2d]">Play another game</p>
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
                <p className="mt-3 text-sm text-white/55">No other game is running right now.</p>
              )}
              <Link
                href="/create"
                className="mt-4 inline-flex font-mono text-[11px] font-bold uppercase text-[#99ee2d]"
              >
                Host your own →
              </Link>
            </div>
          ) : null}
          {live && !matchOver ? (
            // Mid-match sharing: the link carries this round, so the preview shows today's score.
            <div className="mb-6">
              <InviteButton
                url={crownShareUrl(room)}
                title={room.title}
                text={room.kingScore > 0 ? `Beat ${room.kingScore} to take the crown on Crowns.` : `Take the crown on Crowns.`}
                variant="arena"
              />
            </div>
          ) : null}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">Feed</p>
            <ul className="mt-2 space-y-1.5">
              {room.feed.slice(0, 6).map((item) => (
                <li key={item.id} className={`text-xs ${item.good ? 'text-white/70' : 'text-white/40'}`}>
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </ArenaStage>
  );
}
