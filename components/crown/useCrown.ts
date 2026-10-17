'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { fetchCrown } from '@/lib/crown/remote';
import type { CrownSeat } from '@/lib/crown/seats';
import { loadCrown, saveCrown, subscribeCrowns, type CrownRoom, type OutPointRef } from '@/lib/crown/rooms';

function realQuestions(room: CrownRoom): boolean {
  return !room.answersOnServer && room.questions.some((question) => question.salt.some((byte) => byte !== 0));
}

function ahead(local: CrownRoom, remote: CrownRoom): boolean {
  // A live match cell is the clock. A browser that already moved on must not keep its own time.
  if (remote.matchId && remote.deadlineAt != null) return false;
  if (local.status === 'settled' && remote.status !== 'settled') return true;
  if (local.status === 'live' && remote.status === 'lobby') return true;
  if (local.matchId && !remote.matchId) return true;
  return false;
}

function keptBid(local: CrownRoom | null, seatBid: OutPointRef | null): OutPointRef | null {
  return local?.bidOutPoint ?? seatBid;
}

function mergeCrown(
  local: CrownRoom | null,
  remote: CrownRoom | null,
  seats: CrownSeat[],
  address: string,
): CrownRoom | null {
  if (!remote) return local;
  const mine = address.trim().toLowerCase();
  const seatBid = seats.find((seat) => seat.address === mine)?.bidOutPoint ?? null;
  if (local && ahead(local, remote)) {
    return {
      ...local,
      hostAddress: local.hostAddress ?? remote.hostAddress,
      bidOutPoint: keptBid(local, seatBid),
    };
  }
  if (!local || !realQuestions(local)) {
    return {
      ...remote,
      answersOnServer: true,
      bidOutPoint: keptBid(local, seatBid),
      pendingTx: local?.pendingTx ?? null,
      pendingKind: local?.pendingKind ?? null,
    };
  }
  return {
    ...local,
    status: remote.status,
    round: remote.round,
    cursor: remote.cursor,
    potShannons: remote.potShannons,
    king: remote.king,
    deadlineAt: remote.deadlineAt,
    openedAt: remote.openedAt ?? local.openedAt,
    feed: remote.feed.length ? remote.feed : local.feed,
    seals: remote.seals.length ? remote.seals : local.seals,
    matchId: remote.matchId ?? local.matchId,
    hostLockHash: remote.hostLockHash ?? local.hostLockHash,
    hostLock: remote.hostLock ?? local.hostLock,
    hostAddress: remote.hostAddress ?? local.hostAddress,
    matchOutPoint: remote.matchOutPoint ?? local.matchOutPoint,
    treasuryOutPoint: remote.treasuryOutPoint ?? local.treasuryOutPoint,
    kingLock: remote.kingLock ?? local.kingLock,
    bidOutPoint: keptBid(local, seatBid),
    answersOnServer: false,
  };
}

export function useCrown(id: string) {
  const { address } = useWallet();
  const [room, setRoom] = useState<CrownRoom | null>(null);
  const [seats, setSeats] = useState<CrownSeat[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stop = false;
    let reading = false;
    let queued = false;
    const read = async () => {
      if (reading) {
        queued = true;
        return;
      }
      reading = true;
      try {
        const remote = await fetchCrown(id).catch(() => null);
        if (stop) return;
        const local = loadCrown(id);
        let merged = mergeCrown(local, remote?.room ?? null, remote?.seats ?? [], address);
        const latest = loadCrown(id);
        if (merged && latest?.bidOutPoint && !merged.bidOutPoint) {
          merged = { ...merged, bidOutPoint: latest.bidOutPoint };
        }
        if (merged) {
          const previous = latest;
          const changed =
            !previous ||
            previous.status !== merged.status ||
            previous.cursor !== merged.cursor ||
            previous.king !== merged.king ||
            previous.deadlineAt !== merged.deadlineAt ||
            previous.matchId !== merged.matchId ||
            previous.matchOutPoint?.txHash !== merged.matchOutPoint?.txHash ||
            previous.bidOutPoint?.txHash !== merged.bidOutPoint?.txHash ||
            previous.potShannons !== merged.potShannons;
          if (changed) saveCrown(merged);
        }
        setRoom(merged ?? latest);
        setSeats(remote?.seats ?? []);
        setReady(true);
      } finally {
        reading = false;
        if (queued && !stop) {
          queued = false;
          void read();
        }
      }
    };
    void read();
    const poll = window.setInterval(() => void read(), 2000);
    const unsub = subscribeCrowns(() => {
      const local = loadCrown(id);
      if (!local) return;
      setRoom((current) => {
        if (!current || current.id !== id) return local;
        if (local.bidOutPoint && !current.bidOutPoint) return { ...current, bidOutPoint: local.bidOutPoint };
        return current;
      });
    });
    return () => {
      stop = true;
      window.clearInterval(poll);
      unsub();
    };
  }, [address, id]);

  return { room, seats, ready };
}
