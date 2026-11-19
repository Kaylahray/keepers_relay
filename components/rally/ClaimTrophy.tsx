'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ccc } from '@ckb-ccc/connector-react';
import { motion } from 'framer-motion';
import { EASE } from '@/components/crowns/motion';
import { Button } from '@/components/ui/Button';
import { ChainLoader } from '@/components/ui/ChainLoader';
import { TrophyCrown, raceTime } from '@/components/rally/TrophyCard';
import { ckbWhole } from '@/hooks/useRallyStats';
import { plainChainError } from '@/lib/ckb/errors';
import { IMG } from '@/lib/crowns/art';
import { mapName } from '@/lib/rally/rules';
import type { RaceResult } from '@/lib/rally/stats';
import { findTrophies, trophyTx } from '@/lib/rally/trophy';

/**
 * The winner's trophy for one race: claim it into their wallet, or see that it's there. The wallet
 * pays the CKB the trophy holds, and gets it back if they ever melt it.
 */
export function ClaimTrophy({ race, ticks }: { race: RaceResult; ticks: number }) {
  const signer = ccc.useSigner();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trophy = { finishTx: race.txHash, map: race.map, cars: race.players.length, ticks, pot: BigInt(race.pot) };

  const mine = useQuery({
    queryKey: ['my-trophy', race.txHash, Boolean(signer)],
    enabled: Boolean(signer),
    queryFn: async () => {
      const lock = (await signer!.getRecommendedAddressObj()).script;
      const all = await findTrophies(signer!.client, lock);
      return all.some((found) => found.finishTx.toLowerCase() === race.txHash.toLowerCase());
    },
    refetchInterval: (query) => (query.state.data ? false : busy ? 4_000 : false),
  });

  async function claim() {
    if (!signer) return;
    setError(null);
    try {
      setBusy('Making your trophy…');
      const { tx, holds } = await trophyTx(signer, trophy);
      setBusy(`Confirm to collect it. The trophy holds ${ckbWhole(holds)} CKB of yours.`);
      const hash = await signer.sendTransaction(tx);
      setBusy('Adding your trophy…');
      await signer.client.waitTransaction(hash);
      await queryClient.invalidateQueries({ queryKey: ['my-trophy', race.txHash] });
      await queryClient.invalidateQueries({ queryKey: ['trophies'] });
    } catch (cause) {
      setError(plainChainError(cause, 'The trophy could not be made.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: EASE, delay: 0.25 }}
      className="overflow-hidden rounded-[28px] border border-gold/50 bg-black shadow-[0_40px_120px_-40px_rgba(225,191,71,0.5)]"
    >
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={IMG.trophy} alt="A gold crown trophy" className="aspect-[4/3] w-full object-cover" />
        <span className="absolute left-4 top-4">
          <TrophyCrown map={race.map} size={48} />
        </span>
      </div>
      <div className="p-6">
        <p className="font-display text-4xl font-black uppercase leading-none sm:text-5xl">
          {mine.data ? 'Your' : 'Collect your'} <span className="text-gold">trophy</span>
        </p>
        <p className="mt-2 text-fog">
          {mapName(race.map)} · 1st of {race.players.length} · {raceTime(ticks)} · {ckbWhole(race.pot)} CKB pot
        </p>
        <div className="mt-5">
          {busy ? (
            <ChainLoader compact title={busy} />
          ) : mine.data ? (
            <p className="text-lime">It&apos;s yours, and it&apos;s on your profile.</p>
          ) : (
            <>
              <Button variant="gold" size="xl" block onClick={() => void claim()} disabled={!signer || mine.isLoading}>
                Collect your trophy
              </Button>
              <p className="mt-3 text-sm text-fog">
                It&apos;s a Spore in your own wallet. It holds about 230 CKB of yours as storage, which you get back if you ever melt it.
              </p>
            </>
          )}
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        </div>
      </div>
    </motion.div>
  );
}
