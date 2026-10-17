'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { ArenaRailCard, ArenaStage } from '@/components/arena/ArenaStage';
import { leftMs, playClock, useNow } from '@/components/crown/BleedingClock';
import { PromptLine } from '@/components/crown/PromptLine';
import { VerifiedSeal } from '@/components/crown/VerifiedSeal';
import { CrownLobby } from '@/components/crown/CrownLobby';
import { useCrown } from '@/components/crown/useCrown';
import { arenaCoverForSeed } from '@/lib/poster';
import { ccc } from '@ckb-ccc/connector-react';
import { bytesToHex, stealProof } from '@/lib/sudden-death/codec';
import { closeCrown, finishPending, lockBid, MatchMovedError, openMatch, stealCrown } from '@/lib/crown/chain';
import { forgetBid, rememberBid, rememberedBid } from '@/lib/crown/my-bid';
import { forgetMiss, rememberMiss, rememberedMiss } from '@/lib/crown/my-miss';
import { deleteCrownRemote, joinCrownRemote, pushCrownState, requestProof } from '@/lib/crown/remote';
import { useWallet } from '@/hooks/useWallet';
import { useAuth } from '@/context/auth-provider';
import { suddenDeathConfigured } from '@/lib/registry/config';
import { isHostWallet } from '@/lib/crown/standing';
import {
  applySteal,
  ckbWhole,
  forgetCrown,
  kickoff,
  listCrowns,
  loadCrown,
  noteMiss,
  saveCrown,
  settleCrown,
  type CrownRoom,
} from '@/lib/crown/rooms';

const LETTERS = ['A', 'B', 'C', 'D'];
const ZERO_MATCH = new Uint8Array(32);

function scriptHash(lock: { codeHash: string; hashType: 'type' | 'data' | 'data1' | 'data2'; args: string }) {
  return ccc.Script.from({
    codeHash: lock.codeHash,
    hashType: lock.hashType,
    args: lock.args,
  }).hash();
}

function chainMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  if (/still confirming/i.test(message)) return message;
  if (/RBF|unconfirmed inputs/i.test(message)) {
    return 'The last transaction is still in the mempool. Wait a few seconds, then try again.';
  }
  if (/Resolve failed|Unknown\(OutPoint|out ?point/i.test(message)) {
    return 'That cell is not on chain yet. Wait for the last transaction to confirm, then try again.';
  }
  return message;
}

export function CrownPlayView({ id }: { id: string }) {
  const router = useRouter();
  const { room, seats, ready } = useCrown(id);
  const { address, formattedAddress, isConnected } = useWallet();
  const { ensureAuth } = useAuth();
  const signer = ccc.useSigner();
  const chain = suddenDeathConfigured();
  const [picked, setPicked] = useState<number | null>(null);
  const [flash, setFlash] = useState<'hit' | 'miss' | null>(null);
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);
  const [myLockHash, setMyLockHash] = useState<string | null>(null);
  const [others, setOthers] = useState<CrownRoom[]>([]);
  const [matchReady, setMatchReady] = useState(false);
  const now = useNow(room?.status === 'live');

  useEffect(() => {
    if (!signer) {
      setMyLockHash(null);
      return;
    }
    let stop = false;
    void signer.getRecommendedAddressObj().then((obj) => {
      if (!stop) setMyLockHash(obj.script.hash());
    }).catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [signer]);
  const settling = useRef(false);
  const seenDeadline = useRef<number | null>(null);

  useEffect(() => {
    setOthers(listCrowns().filter((item) => item.id !== id).slice(0, 4));
  }, [id, room]);

  useEffect(() => {
    if (!chain || !room?.matchOutPoint || room.status !== 'live') {
      setMatchReady(!chain);
      return;
    }
    const txHash = room.matchOutPoint.txHash;
    if (!signer) {
      setMatchReady(false);
      return;
    }
    let stop = false;
    const look = async () => {
      try {
        const tx = await signer.client.getTransaction(txHash);
        if (!stop) setMatchReady(tx?.status === 'committed');
      } catch {
        if (!stop) setMatchReady(false);
      }
    };
    void look();
    const timer = window.setInterval(() => void look(), 2000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [chain, room?.matchOutPoint?.txHash, room?.status, signer]);

  useEffect(() => {
    if (!room || room.status !== 'live' || room.deadlineAt == null) return;
    if (seenDeadline.current !== room.deadlineAt) {
      seenDeadline.current = room.deadlineAt;
      settling.current = false;
    }
    if (settling.current) return;
    if (room.matchId) return;
    if (leftMs(room.deadlineAt, Date.now()) > 0) return;
    settling.current = true;
    const king = room.king;
    saveCrown(
      settleCrown(
        room,
        king
          ? 'You hold the crown when the deadline hits.'
          : 'Nobody took the crown. A zero king cannot be paid.',
      ),
    );
  }, [room, now]);

  const player = address?.trim().toLowerCase() || 'local';

  useEffect(() => {
    if (!room?.id || room.cursor == null) return;
    const miss = rememberedMiss(room.id, player) ?? rememberedMiss(room.id, 'local');
    if (miss && miss.cursor === room.cursor) {
      if (player !== 'local') rememberMiss(room.id, player, miss);
      setPicked(miss.index);
      setFlash('miss');
      return;
    }
    if (miss) {
      forgetMiss(room.id, player);
      forgetMiss(room.id, 'local');
    }
    setPicked(null);
    setFlash((current) => (current === 'miss' ? null : current));
  }, [room?.id, room?.cursor, player]);

  if (!ready) {
    return (
      <ArenaStage>
        <p className="text-sm text-white/50">Loading crown.</p>
      </ArenaStage>
    );
  }

  if (!room) {
    return (
      <ArenaStage backHref="/play" backLabel="Crowns">
        <h1 className="font-poster text-5xl uppercase text-white">Missing crown</h1>
        <p className="mt-3 text-sm text-white/55">This lobby is not on the server, and this browser does not have it saved.</p>
      </ArenaStage>
    );
  }

  const seatBid = seats.find((seat) => seat.address === address.trim().toLowerCase())?.bidOutPoint ?? null;
  const savedBid = rememberedBid(room.id, address);
  const entryBid = room.bidOutPoint ?? seatBid ?? savedBid;
  let iHold = false;
  if (room.kingLock && myLockHash) {
    try {
      iHold = scriptHash(room.kingLock).toLowerCase() === myLockHash.toLowerCase();
    } catch {
      iHold = false;
    }
  }
  const iHost = isHostWallet(room, address, myLockHash);
  const prompt = room.questions[room.cursor];
  const live = room.status === 'live' && Boolean(prompt);
  const panic = live && room.deadlineAt != null && leftMs(room.deadlineAt, now) <= 4_000;

  async function closeMatch() {
    if (!room) return;
    if (!signer) {
      setChainError('Connect the host wallet to close.');
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
      setChainError('Connect JoyID. The host wallet mints the match cell.');
      return;
    }
    setBusy('Minting the match and treasury…');
    try {
      const opened = await openMatch(signer, room);
      const next = kickoff(
        { ...opened, hostAddress: room.hostAddress ?? (address ? address.toLowerCase() : null) },
        opened.deadlineAt ?? Date.now(),
      );
      saveCrown(next);
      await pushCrownState(next);
    } catch (error) {
      setChainError(chainMessage(error, 'The match transaction failed.'));
    } finally {
      setBusy(null);
    }
  }

  async function signPending() {
    const current = loadCrown(id);
    if (!current?.pendingTx || !signer) {
      setChainError('Connect the wallet that still has to sign.');
      return;
    }
    setBusy('Signing…');
    setChainError(null);
    try {
      saveCrown(await finishPending(signer, current));
    } catch (error) {
      setChainError(chainMessage(error, 'The signature was rejected.'));
    } finally {
      setBusy(null);
    }
  }

  async function answer(index: number) {
    if (!room || !prompt || room.status !== 'live' || picked !== null || busy) return;
    if (chain && !matchReady) return;
    if (!address.trim()) {
      setChainError('Connect a wallet to answer. A spectator uses the watch screen.');
      return;
    }
    try {
      await ensureAuth();
    } catch (error) {
      setChainError(error instanceof Error ? error.message : 'Sign in with your wallet to answer.');
      return;
    }
    const closed =
      rememberedMiss(room.id, player)?.cursor === room.cursor ||
      rememberedMiss(room.id, 'local')?.cursor === room.cursor;
    if (closed) return;
    const late = room.deadlineAt != null && Date.now() >= room.deadlineAt;
    if (late && !room.matchId) return;
    if (late && !entryBid && !iHold) return;
    if (iHold && !entryBid) {
      setChainError('You hold the crown. Lock again only after someone takes it.');
      return;
    }
    setPicked(index);
    if (room.answersOnServer) {
      setBusy('Checking the answer…');
      setChainError(null);
      let held = false;
      try {
        const attempt = await requestProof(room.id, index);
        if (!attempt.proof) {
          held = true;
          markMiss(room, index);
          return;
        }
        if (!signer) {
          setChainError('Connect JoyID. A steal itself needs no signature.');
          return;
        }
        let current = loadCrown(id) ?? room;
        if (!current.bidOutPoint && entryBid) current = { ...current, bidOutPoint: entryBid };
        if (!current.bidOutPoint) {
          setBusy('Locking the entry fee…');
          current = await lockBid(signer, current);
          saveCrown(current);
          if (address && current.bidOutPoint) {
            rememberBid(room.id, address, current.bidOutPoint);
            void joinCrownRemote(room.id, {
              address,
              displayName: formattedAddress || 'Player',
              bidOutPoint: current.bidOutPoint,
            }).catch(() => undefined);
          }
        }
        setBusy('Sending the steal…');
        const result = await stealCrown(signer, current, attempt.proof);
        const named = { ...result.room, king: formattedAddress || result.room.king };
        if (address) forgetBid(room.id, address);
        saveCrown(named);
        await pushCrownState(named);
        if (address) {
          void joinCrownRemote(room.id, { address, displayName: formattedAddress || 'Player', clearBid: true }).catch(() => undefined);
        }
        setFlash('hit');
      } catch (error) {
        if (error instanceof MatchMovedError) saveCrown(error.room);
        setChainError(chainMessage(error, 'The steal failed.'));
      } finally {
        setBusy(null);
        if (!held) {
          window.setTimeout(() => {
            setPicked(null);
            setFlash(null);
            setShake(false);
          }, 700);
        }
      }
      return;
    }
    if (index === prompt.correct) {
      if (!chain || !room.matchId) {
        const proof = stealProof(ZERO_MATCH, room.questions, room.cursor);
        const next = applySteal(room, `Proof ${bytesToHex(proof).slice(0, 18)}… is local until a match cell exists.`);
        setFlash('hit');
        window.setTimeout(() => {
          saveCrown(next);
          setPicked(null);
          setFlash(null);
        }, 420);
        return;
      }
      if (!signer) {
        setChainError('Connect JoyID. A steal itself needs no signature.');
        setPicked(null);
        return;
      }
      setBusy(entryBid ? 'Sending the steal…' : 'Locking the entry fee…');
      setChainError(null);
      try {
        let current = loadCrown(id) ?? room;
        if (!current.bidOutPoint && entryBid) current = { ...current, bidOutPoint: entryBid };
        if (!current.bidOutPoint) {
          current = await lockBid(signer, current);
          saveCrown(current);
          if (address && current.bidOutPoint) rememberBid(room.id, address, current.bidOutPoint);
          setBusy('Sending the steal…');
        }
        const result = await stealCrown(signer, current);
        const named = { ...result.room, king: formattedAddress || result.room.king };
        if (address) forgetBid(room.id, address);
        saveCrown(named);
        void pushCrownState(named).catch(() => undefined);
        if (address) {
          void joinCrownRemote(room.id, { address, displayName: formattedAddress || 'Player', clearBid: true }).catch(() => undefined);
        }
        setFlash('hit');
      } catch (error) {
        if (error instanceof MatchMovedError) saveCrown(error.room);
        setChainError(chainMessage(error, 'The steal failed.'));
      } finally {
        setBusy(null);
        setPicked(null);
        setFlash(null);
      }
      return;
    }
    markMiss(room, index);
  }

  function markMiss(current: CrownRoom, index: number) {
    const miss = { cursor: current.cursor, index };
    rememberMiss(current.id, player, miss);
    rememberMiss(current.id, 'local', miss);
    setFlash('miss');
    setShake(true);
    const missed = noteMiss(current);
    saveCrown(missed);
    void pushCrownState(missed).catch(() => undefined);
    window.setTimeout(() => setShake(false), 300);
  }

  const clockLeft = leftMs(room.deadlineAt, now);
  const clockSpan =
    room.deadlineAt == null || room.openedAt == null ? 1 : Math.max(1, room.deadlineAt - room.openedAt);
  const clockProgress = room.deadlineAt == null ? 0 : Math.max(0, Math.min(100, (clockLeft / clockSpan) * 100));
  const clock = playClock(room.deadlineAt, now);
  const hostClose =
    iHost && chain && room.matchId && room.status === 'live' ? (
      <div className="mb-4">
        <button
          type="button"
          onClick={() => void closeMatch()}
          disabled={Boolean(busy) || clock.counting}
          className="bg-[#e1bf47] px-5 py-3 font-poster text-2xl uppercase leading-none text-[#111] disabled:opacity-40"
        >
          {busy === 'Closing…' ? busy : 'Close the crown'}
        </button>
        <p className="mt-2 text-sm text-white/55">
          {clock.counting
            ? 'You are the host. This pays whoever holds the crown once the play window ends.'
            : 'You are the host. This pays whoever holds the crown right now.'}
        </p>
      </div>
    ) : null;

  if (room.status === 'lobby') {
    return (
      <ArenaStage backHref="/play" backLabel="Crowns">
        <CrownLobby
          room={room}
          seats={seats}
          busy={busy}
          error={chainError}
          onStart={() => void startClock()}
          onDelete={iHost ? () => void removeLobby() : undefined}
        />
      </ArenaStage>
    );
  }

  return (
    <ArenaStage backHref="/play" backLabel="Crowns">
      <section className={`grid items-end gap-8 lg:grid-cols-[1fr_auto_minmax(260px,320px)] lg:gap-0 ${shake ? 'animate-[sdshake_0.4s_linear]' : ''}`}>
        <div className="relative z-10 max-w-xl pb-6">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
            {room.title}
          </p>
          <div className="mt-4 flex items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">Pot</p>
              <p className="font-poster text-7xl uppercase leading-none text-[#99ee2d] sm:text-8xl">
                {ckbWhole(room.potShannons)}
              </p>
              <p className="font-mono text-[11px] uppercase text-white/45">CKB</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">Each steal</p>
              <p className="font-poster text-4xl uppercase leading-none text-white">+{ckbWhole(room.feeShannons)}</p>
              <p className="font-mono text-[11px] uppercase text-white/45">CKB into the pot</p>
            </div>
          </div>
          {room.status === 'live' && !prompt ? (
            <>
              <h1 className="mt-3 font-poster text-[clamp(2.75rem,6vw,4.5rem)] uppercase leading-[0.92] text-white">
                Bank finished
              </h1>
              <p className="mt-4 max-w-md text-base font-light leading-relaxed text-white/60">
                There is no next proof. {room.king ?? 'The open seat'} holds until the closing transaction lands.
              </p>
              {hostClose}
            </>
          ) : room.status === 'settled' || !prompt ? (
            <>
              <h1 className="mt-3 font-poster text-[clamp(2.75rem,6vw,4.5rem)] uppercase leading-[0.92] text-white">
                {room.status === 'settled' ? 'Closed' : room.king ? 'You hold it' : 'Open seat'}
              </h1>
              <p className="mt-4 max-w-md text-base font-light leading-relaxed text-white/60">
                {room.status === 'settled'
                  ? `${ckbWhole(room.potShannons)} CKB was paid to ${iHold ? 'you' : room.king ?? 'the open seat'}.`
                  : `${ckbWhole(room.potShannons)} CKB in the pot. ${room.feed[0]?.text ?? ''}`}
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 font-mono text-[10px] uppercase text-[#e1bf47]">
                Round {room.round} · {prompt.tag}
              </p>
              {prompt.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={prompt.image} alt="" className="mt-4 max-h-72 w-full object-cover" />
              ) : null}
              <h1 className="mt-3 font-poster text-[clamp(2rem,5vw,3.5rem)] uppercase leading-[0.92] text-white">
                <PromptLine text={prompt.text} lyric={prompt.skin === 'lyric' || prompt.skin === 'chant'} />
              </h1>
              <div className="mt-5">
                <div className="mb-1 flex items-end justify-between gap-4">
                  <span className="font-mono text-[10px] font-bold uppercase text-white/40">
                    Question {Math.min(room.cursor + 1, room.questions.length)} of {room.questions.length}
                  </span>
                  <span className="text-right">
                    <span className="block font-mono text-[10px] font-bold uppercase text-white/40">
                      {clock.counting ? 'Time left to play' : 'Host may close'}
                    </span>
                    <span
                      className={`font-poster uppercase leading-none ${clock.counting ? 'text-6xl' : 'text-4xl'} ${clock.counting && panic ? 'text-[#af2a3a]' : 'text-[#99ee2d]'}`}
                    >
                      {clock.face}
                    </span>
                  </span>
                </div>
                <p className="mb-2 text-sm text-white/55">{clock.caption}</p>
                {hostClose}
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
                  {iHost ? 'Host' : iHold ? 'You hold the crown' : isConnected ? 'Player' : 'Spectator'}
                </p>
                {!isConnected ? (
                  <div className="mb-4">
                    <ArenaCta onClick={() => void ensureAuth().catch(() => undefined)}>Connect to play</ArenaCta>
                  </div>
                ) : null}
                {iHold && !entryBid ? (
                  <p className="mb-4 text-sm text-white/70">You hold the crown. The others can still take it. Lock again only after you lose it.</p>
                ) : null}
                {flash === 'miss' ? (
                  <p className="mb-4 text-sm text-white/70">
                    Wrong answer. That was your one try on this question.
                  </p>
                ) : null}
                {chain && room.matchId && isConnected && !matchReady ? (
                  <p className="mb-4 text-sm text-white/70">
                    You will be able to play once the match cell confirms.
                  </p>
                ) : null}
                {chain && room.matchId && isConnected && matchReady && !entryBid && !iHold && flash !== 'miss' ? (
                  <div className="mb-4">
                    {room.cursor > 0 ? (
                      <p className="mb-3 text-sm text-white/55">
                        Your entry was spent when you took the crown. Lock again to take it back.
                      </p>
                    ) : null}
                    <ArenaCta
                      onClick={() => {
                        if (!signer) {
                          setChainError('Connect JoyID to lock the entry bid.');
                          return;
                        }
                        setBusy('Locking the entry fee…');
                        setChainError(null);
                        void lockBid(signer, loadCrown(id) ?? room)
                          .then((next) => {
                            saveCrown(next);
                            if (address && next.bidOutPoint) {
                              rememberBid(room.id, address, next.bidOutPoint);
                              void joinCrownRemote(room.id, {
                                address,
                                displayName: formattedAddress || 'Player',
                                bidOutPoint: next.bidOutPoint,
                              }).catch(() => undefined);
                            }
                          })
                          .catch((error: unknown) => {
                            if (error instanceof MatchMovedError) saveCrown(error.room);
                            setChainError(chainMessage(error, 'The bid failed.'));
                          })
                          .finally(() => setBusy(null));
                      }}
                      disabled={Boolean(busy)}
                    >
                      {busy ?? (room.cursor > 0 ? 'Lock to take it back' : 'Lock your entry')}
                    </ArenaCta>
                  </div>
                ) : null}
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${panic ? 'bg-[#af2a3a]' : 'bg-gradient-to-r from-[#ff56f6] to-[#406aff]'}`}
                    style={{ width: `${clockProgress}%` }}
                  />
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {prompt.options.map((option, index) => {
                  const on = picked === index;
                  const good = flash === 'hit' && index === prompt.correct;
                  const bad = flash === 'miss' && on;
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={picked !== null || !isConnected || (iHold && !entryBid) || (chain && !matchReady)}
                      onClick={() => answer(index)}
                      className={`border px-4 py-4 text-left transition disabled:opacity-50 ${
                        good
                          ? 'border-[#99ee2d] bg-[#99ee2d]/15'
                          : bad
                            ? 'border-[#af2a3a] bg-[#af2a3a]/20'
                            : 'border-white/10 bg-white/5 hover:border-[#99ee2d]/40'
                      }`}
                    >
                      <span className="font-mono text-[10px] uppercase text-white/40">{LETTERS[index]}</span>
                      <span className="mt-1 block text-base font-semibold text-white">{option}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {room.pendingTx ? (
            <div className="mt-6">
              <p className="max-w-md text-sm text-[#e1bf47]">
                A previous signature is still waiting. Approve it once, then the rest of the crown moves without you.
              </p>
              <div className="mt-3">
                <ArenaCta onClick={() => void signPending()} disabled={Boolean(busy)}>
                  {busy ?? 'Sign'}
                </ArenaCta>
              </div>
            </div>
          ) : null}
          {chainError ? <p className="mt-4 max-w-md text-sm text-[#af2a3a]">{chainError}</p> : null}
          {busy && room.status === 'live' ? <p className="mt-3 font-mono text-[10px] uppercase text-white/50">{busy}</p> : null}
          <p className="mt-6 font-mono text-[10px] uppercase text-white/40">
            Pot {ckbWhole(room.potShannons)} CKB · {room.status === 'settled' && iHold ? 'you' : room.king ?? 'Open seat'}
          </p>
          <div className="mt-3 flex gap-4">
            <Link href={`/watch/${room.id}`} className="border-b border-[#bef970] pb-1 text-sm font-bold uppercase text-white">
              Watch →
            </Link>
            {iHost && room.status === 'live' ? (
              <Link href={`/host/${room.id}`} className="border-b border-[#e1bf47] pb-1 text-sm font-bold uppercase text-[#e1bf47]">
                Close the crown →
              </Link>
            ) : null}
          </div>
          {room.seals[0] ? (
            <div className="mt-4">
              <VerifiedSeal seal={room.seals[0]} />
            </div>
          ) : null}
        </div>

        <div className="relative mx-auto hidden h-[min(52vh,480px)] w-[280px] shrink-0 lg:block xl:w-[320px]">
          <div
            className="pointer-events-none absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-[#a855f7]/35 blur-[80px]"
            aria-hidden
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/uismod/organizer.png"
            alt=""
            className="relative z-10 h-full w-full object-contain object-bottom drop-shadow-[0_0_40px_rgba(168,85,247,0.45)]"
          />
        </div>

        <aside className="relative z-10 border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div
            className="pointer-events-none absolute left-0 top-8 hidden h-[70%] w-px bg-gradient-to-b from-[#99ee2d] via-[#a855f7] to-transparent lg:block"
            aria-hidden
          />
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#99ee2d]">
            Crowns
          </p>
          <ul className="mt-4 space-y-2.5">
            <li>
              <ArenaRailCard
                href={`/play/${room.id}`}
                eyebrow="This crown"
                title={room.title}
                meta={`${ckbWhole(room.potShannons)} CKB pot · ${room.status === 'settled' && iHold ? 'you' : room.king ?? 'Open seat'}`}
                cover={arenaCoverForSeed(room.title)}
                cta="Here"
              />
            </li>
            {others.map((item) => (
              <li key={item.id}>
                <ArenaRailCard
                  href={
                    item.status === 'lobby' && isHostWallet(item, address, myLockHash)
                      ? `/host/${item.id}`
                      : `/play/${item.id}`
                  }
                  eyebrow={item.status}
                  title={item.title}
                  meta={`${ckbWhole(item.potShannons)} CKB pot · ${item.king ?? 'Open seat'}`}
                  cover={arenaCoverForSeed(item.title)}
                  cta="Enter"
                />
              </li>
            ))}
          </ul>
        </aside>
      </section>
      <style>{`@keyframes sdshake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}`}</style>
    </ArenaStage>
  );
}
