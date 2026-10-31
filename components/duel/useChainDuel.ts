'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getCkbClient } from '@/lib/ckb/client';
import { replay, type ArtilleryState } from '@/lib/duel/artillery';
import { findDuel, findPastDuel, type DuelSnapshot } from '@/lib/duel/chain';
import { duelSeed, duelWind, KIND_ARTILLERY } from '@/lib/duel/codec';
import { bytesToHex, hexToBytes } from '@/lib/sudden-death/codec';
import { chainNames } from '@/lib/registry/chain-names';

export type ChainDuel = {
  /** The duel's live cell, or the last one seen once it has been finished. */
  snapshot: DuelSnapshot | null;
  /** The cell is gone: finished, or cancelled. `snapshot` then holds its last state. */
  gone: boolean;
  loading: boolean;
  /** Artillery: the board the chain would replay, and the wind the next shot fires in. */
  board: ArtilleryState | null;
  wind: number | null;
  names: Map<string, string>;
  refresh: () => void;
};

/** One duel, read from the chain every few seconds. */
export function useChainDuel(duelId: string): ChainDuel {
  const [snapshot, setSnapshot] = useState<DuelSnapshot | null>(null);
  const [gone, setGone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [tick, setTick] = useState(0);
  const seen = useRef(false);

  useEffect(() => {
    let stop = false;
    const read = async () => {
      const found = await findDuel(getCkbClient(), duelId).catch(() => undefined);
      if (stop || found === undefined) return;
      if (found) {
        seen.current = true;
        setSnapshot(found);
        setGone(false);
      } else if (seen.current) {
        setGone(true);
      } else {
        // Opened after the duel ended: show its last state from history, so it can still be replayed.
        const past = await findPastDuel(getCkbClient(), duelId).catch(() => null);
        if (stop) return;
        if (past) {
          seen.current = true;
          setSnapshot(past);
          setGone(true);
        }
      }
      setLoading(false);
    };
    void read();
    // Keep reading even in a background tab: a duel moves on whether or not you are looking, and a screen left on an old turn would fire into a duel that has moved past it.
    const id = window.setInterval(() => void read(), 3_000);
    const onShow = () => {
      if (!document.hidden) void read();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      stop = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [duelId, tick]);

  const challenger = snapshot ? bytesToHex(snapshot.duel.challenger) : null;
  const opponent = snapshot ? bytesToHex(snapshot.duel.opponent) : null;
  useEffect(() => {
    const hashes = [challenger, opponent].filter((hash): hash is string => Boolean(hash) && !/^0x0+$/.test(hash!));
    if (hashes.length === 0) return;
    let stop = false;
    void chainNames(getCkbClient(), hashes)
      .then((found) => {
        if (!stop) setNames(found);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [challenger, opponent]);

  // Rebuilt only when the duel moves: the board the chain would replay, and the next shot's wind.
  const { board, wind } = useMemo(() => {
    if (!snapshot || snapshot.duel.kind !== KIND_ARTILLERY || snapshot.duel.status !== 1 || !snapshot.landed) {
      return { board: null, wind: null };
    }
    const id = hexToBytes(snapshot.duelId);
    const landedBlock = hexToBytes(snapshot.landed.blockHash);
    const seedBlock = snapshot.duel.shots.length === 0 ? landedBlock : snapshot.duel.seedBlock;
    return { board: replay(duelSeed(id, seedBlock), snapshot.duel.shots), wind: duelWind(id, landedBlock) };
  }, [snapshot]);

  return { snapshot, gone, loading, board, wind, names, refresh: () => setTick((t) => t + 1) };
}
