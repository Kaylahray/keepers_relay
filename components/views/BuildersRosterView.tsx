'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Crown, UsersRound, WalletMinimal } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { BuilderCard } from '@/components/arena/BuilderCard';
import { useBuildersRoster, useMyBuilder } from '@/hooks/useBuilder';
import { useChainQuery } from '@/hooks/useChain';
import { useWallet } from '@/hooks/useWallet';

export function BuildersRosterView() {
  const roster = useBuildersRoster();
  const { data: chain } = useChainQuery();
  const { connect, isConnected } = useWallet();
  const myBuilder = useMyBuilder();
  const currentKeeper =
    chain?.status === 'alive' ? chain?.owners[chain.owners.length - 1]?.name : undefined;

  const ranked = [...(roster.data ?? [])].sort(
    (a, b) => (b.pointsBalance ?? 0) - (a.pointsBalance ?? 0),
  );

  return (
    <PageShell
      eyebrow="Leaderboard"
      title="Who’s on the board"
      intro="Keepers ranked by points — the cast that keeps Cells alive."
      backHref="/"
      backLabel="Arena"
    >
      {!isConnected && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="max-w-xl text-sm font-medium text-white/70">
            Connect your wallet to appear on the leaderboard.
          </p>
          <button
            type="button"
            onClick={() => connect()}
            className="arena-cta flex items-center gap-2 rounded-md px-4 py-3 text-xs font-bold uppercase"
          >
            <WalletMinimal className="h-4 w-4" />
            Connect & join
          </button>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 rounded-lg bg-[#ff56f6]/15 px-3 py-2 text-[10px] font-bold uppercase text-[#ff56f6]">
          <UsersRound className="h-3.5 w-3.5" />
          {ranked.length} Keepers
        </span>
        {currentKeeper && (
          <span className="flex items-center gap-1.5 rounded-lg bg-[#e1bf47]/20 px-3 py-2 text-[10px] font-bold uppercase text-[#e1bf47]">
            <Crown className="h-3.5 w-3.5" />
            {currentKeeper} holds the Cell
          </span>
        )}
      </div>

      {roster.isLoading || !roster.data ? (
        <div className="h-64 animate-pulse rounded-2xl bg-white/5" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ranked.map((builder, index) => {
            const isMe = myBuilder.data?.builder?.address === builder.address;
            const holding =
              currentKeeper?.toLowerCase() === builder.displayName.toLowerCase();

            return (
              <motion.div
                key={builder.address}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="relative"
              >
                <span className="absolute left-3 top-3 z-20 rounded-md bg-black/60 px-2 py-0.5 font-mono text-[10px] font-bold text-white backdrop-blur-sm">
                  #{index + 1}
                </span>
                <BuilderCard
                  displayName={builder.displayName}
                  username={builder.username}
                  headline={builder.headline}
                  characterId={builder.characterId}
                  levelLabel={holding ? 'Holding the Cell' : `Rank #${index + 1}`}
                  pointsBalance={builder.pointsBalance}
                  href={
                    builder.username
                      ? `/u/${builder.username}`
                      : `/profile/${encodeURIComponent(builder.address)}`
                  }
                  highlight={isMe || holding}
                />
              </motion.div>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-white/40">
        <Link href="/profile/me" className="text-[#ff56f6] hover:underline">
          Open your passport
        </Link>
      </p>
    </PageShell>
  );
}
