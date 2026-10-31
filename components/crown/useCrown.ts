'use client';

import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { fetchCrown } from '@/lib/crown/remote';
import type { CrownSeat } from '@/lib/crown/seats';
import { loadCrown, saveCrown, subscribeCrowns, type CrownRoom, type OutPointRef } from '@/lib/crown/rooms';

/** How long a browser may show its own steal before the shared clock must agree. */
const OPTIMISTIC_STEAL_MS = 90_000;

function ahead(local: CrownRoom, remote: CrownRoom, at: number): boolean {
  if (local.status === 'settled' && remote.status !== 'settled') return true;
  if (local.matchId && !remote.matchId) return true;
  if (remote.matchId && remote.deadlineAt != null) {
    // A live match cell is the clock, and no browser keeps its own time against it.
    // The single exception is the player whose steal is still in the mempool: they see the
    // crown they just took, for as long as that steal has a chance of confirming. Everyone
    // else — and they too, once it lands or expires — reads the round out of the cell.
    if (local.round <= remote.round) return false;
    const sent = local.stealPendingAt ?? 0;
    return sent > 0 && at - sent < OPTIMISTIC_STEAL_MS;
  }
  if (local.status === 'live' && remote.status === 'lobby') return true;
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
  if (local && ahead(local, remote, Date.now())) {
    return {
      ...local,
      feed: remote.feed.length ? remote.feed : local.feed,
      hostAddress: local.hostAddress ?? remote.hostAddress,
      bidOutPoint: keptBid(local, seatBid),
    };
  }
  // The server's room is read from the chain, and nothing about it is secret, so it wins.
  // This browser only adds what is its own: the entry it locked.
  return {
    ...remote,
    bidOutPoint: keptBid(local, seatBid),
    stealPendingAt: null,
  };
}

export function useCrown(id: string) {
  const { address } = useWallet();
  const [room, setRoom] = useState<CrownRoom | null>(null);
  const [seats, setSeats] = useState<CrownSeat[]>([]);
  const [ready, setReady] = useState(false);
  /** The last read failed on the network, as opposed to the crown not existing. Polling keeps retrying. */
  const [unreachable, setUnreachable] = useState(false);
  /** Read by the poll to decide its own cadence, without restarting the interval. */
  const liveNow = useRef(false);

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
        let failed = false;
        const remote = await fetchCrown(id).catch(() => {
          failed = true;
          return null;
        });
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
            previous.round !== merged.round ||
            previous.kingScore !== merged.kingScore ||
            previous.king !== merged.king ||
            previous.deadlineAt !== merged.deadlineAt ||
            previous.matchId !== merged.matchId ||
            previous.matchOutPoint?.txHash !== merged.matchOutPoint?.txHash ||
            previous.bidOutPoint?.txHash !== merged.bidOutPoint?.txHash ||
            previous.potShannons !== merged.potShannons;
          if (changed) saveCrown(merged);
        }
        const next = merged ?? latest;
        liveNow.current = next?.status === 'live';
        setRoom(next);
        setSeats(remote?.seats ?? []);
        setUnreachable(failed);
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
    // The clock has to stay shared, so a live match really is polled every two seconds.
    // A lobby is not a clock, and a tab nobody is looking at is not either — both used to
    // poll just as hard, which is what filled the network tab.
    let tick = 0;
    const poll = window.setInterval(() => {
      tick += 1;
      if (document.hidden) return;
      if (!liveNow.current && tick % 4 !== 0) return;
      void read();
    }, 2000);
    const onVisible = () => {
      if (!document.hidden) void read();
    };
    document.addEventListener('visibilitychange', onVisible);
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
      document.removeEventListener('visibilitychange', onVisible);
      unsub();
    };
  }, [address, id]);

  return { room, seats, ready, unreachable };
}
