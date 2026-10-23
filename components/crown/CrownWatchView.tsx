'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ccc } from '@ckb-ccc/connector-react';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { BleedingClock, leftMs, useNow } from '@/components/crown/BleedingClock';
import { NeonPlate } from '@/components/crown/CrownCard';
import { PlayCode } from '@/components/crown/PlayCode';
import { VerifiedSeal } from '@/components/crown/VerifiedSeal';
import { useCrown } from '@/components/crown/useCrown';
import { useWallet } from '@/hooks/useWallet';
import { DEFAULT_DURATION_MS, ckbWhole } from '@/lib/crown/rooms';
import { isHostWallet } from '@/lib/crown/standing';

function scriptHash(lock: { codeHash: string; hashType: 'type' | 'data' | 'data1' | 'data2'; args: string }) {
  return ccc.Script.from(lock).hash();
}

export function CrownWatchView({ id }: { id: string }) {
  const { room, ready } = useCrown(id);
  const { address } = useWallet();
  const signer = ccc.useSigner();
  const [myLockHash, setMyLockHash] = useState<string | null>(null);
  const now = useNow(room?.status === 'live');
  const playPath = `/play/${id}`;

  useEffect(() => {
    if (!signer) {
      setMyLockHash(null);
      return;
    }
    void signer.getRecommendedAddressObj().then((obj) => {
      setMyLockHash(obj.script.hash());
    }).catch(() => setMyLockHash(null));
  }, [signer]);
  const panic =
    room?.status === 'live' && room.deadlineAt != null && leftMs(room.deadlineAt, now) <= 4_000 && leftMs(room.deadlineAt, now) > 0;

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
      </ArenaStage>
    );
  }

  let paidYou = false;
  if (room.kingLock && myLockHash) {
    try {
      paidYou = scriptHash(room.kingLock).toLowerCase() === myLockHash.toLowerCase();
    } catch {
      paidYou = false;
    }
  }
  if (!paidYou && room.king && address) {
    const mine = address.trim().toLowerCase();
    paidYou = room.king.toLowerCase() === `${mine.slice(0, 8)}…${mine.slice(-6)}`;
  }
  const iHost = isHostWallet(room, address, myLockHash);
  const closed = room.status === 'settled';
  const kingName = paidYou ? 'You' : room.king ?? 'Open seat';

  return (
    <ArenaStage backHref="/play" backLabel="Crowns">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">Watch</p>
      <h1 className="mt-2 font-poster text-5xl uppercase leading-none text-white sm:text-7xl">{room.title}</h1>
      <div className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <NeonPlate className={`p-6 ${panic ? 'border-[#af2a3a]' : ''}`}>
          {closed ? (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Closed</p>
              <p className="font-poster text-5xl uppercase leading-none text-[#99ee2d] sm:text-6xl">Paid</p>
            </div>
          ) : (
            <BleedingClock
              deadlineAt={room.deadlineAt}
              live={room.status === 'live'}
              openingMs={room.durationMs || DEFAULT_DURATION_MS}
            />
          )}
          <div className="mt-8 grid grid-cols-2 gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase text-white/50">{closed ? 'Paid to' : 'King'}</p>
              <p className="mt-1 font-poster text-4xl uppercase">{kingName}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase text-white/50">Pot</p>
              <p className="mt-1 font-poster text-4xl uppercase">{ckbWhole(room.potShannons)}</p>
              <p className="font-mono text-[10px] uppercase text-white/50">CKB</p>
            </div>
          </div>
          <p className="mt-6 text-sm text-white/70">
            {room.status === 'lobby'
              ? 'Waiting for the clock to start.'
              : closed
                ? `${ckbWhole(room.potShannons)} CKB was paid to ${paidYou ? 'you' : room.king ?? 'the open seat'}.`
                : 'Beat the score to take the crown before the clock runs out.'}
          </p>
        </NeonPlate>
        <NeonPlate className="p-6">
          <p className="font-mono text-[10px] uppercase text-white/50">Point a phone here</p>
          <div className="mt-4">
            <PlayCode id={id} size={220} />
          </div>
          <p className="mt-4 text-sm text-white/70">
            Spectators watch this screen. The code opens the play page. This page does not play.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href={playPath} className="arena-cta inline-flex px-4 py-2 font-mono text-[11px] font-bold uppercase">
              Open play
            </Link>
            {iHost ? (
              <Link href={`/host/${id}`} className="border border-[#e1bf47] px-4 py-2 font-mono text-[11px] uppercase text-[#e1bf47]">
                Host desk
              </Link>
            ) : null}
          </div>
          <ul className="mt-4 space-y-2">
            {room.seals.slice(0, 3).map((seal) => (
              <li key={seal.id}>
                <VerifiedSeal seal={seal} />
              </li>
            ))}
          </ul>
          {room.matchOutPoint ? (
            <Link
              href={`/verify/${room.matchOutPoint.txHash}`}
              className="mt-4 inline-block border border-[#99ee2d]/50 px-4 py-2 font-mono text-[11px] uppercase text-[#99ee2d] hover:bg-[#99ee2d]/10"
            >
              Check this crown yourself
            </Link>
          ) : null}
        </NeonPlate>
      </div>
    </ArenaStage>
  );
}
