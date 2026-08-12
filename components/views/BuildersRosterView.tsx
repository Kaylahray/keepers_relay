'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { Crown, UsersRound, WalletMinimal } from 'lucide-react';
import { CharacterAvatar } from '@/components/CharacterPicker';
import { PageShell } from '@/components/PageShell';
import { useBuildersRoster, useMyBuilder } from '@/hooks/useBuilder';
import { useChainQuery } from '@/hooks/useChain';
import { useWallet } from '@/hooks/useWallet';
import { getCharacter } from '@/lib/characters';

export function BuildersRosterView() {
  const roster = useBuildersRoster();
  const { data: chain } = useChainQuery();
  const { connect, isConnected } = useWallet();
  const myBuilder = useMyBuilder();
  const currentKeeper = chain?.owners[chain.owners.length - 1]?.name;

  return (
    <PageShell
      eyebrow="CKB builder crew"
      title="Who’s keeping the chain"
      intro="Every connected builder in the crew."
      backHref="/"
      backLabel="Home"
    >
      {!isConnected && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-[3px] border-black bg-black p-4 text-[#fff8e7] shadow-[6px_6px_0_#ff4cbd]">
          <p className="max-w-xl text-sm font-semibold leading-relaxed">
            Connect your wallet to appear on the roster.
          </p>
          <button
            type="button"
            onClick={() => connect()}
            className="neo-button flex items-center gap-2 bg-[#d6ff00] px-4 py-3 text-xs font-black uppercase text-black"
          >
            <WalletMinimal className="h-4 w-4 stroke-[3]" />
            Connect & join
          </button>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 border-[3px] border-black bg-[#d6ff00] px-3 py-2 text-[10px] font-black uppercase">
          <UsersRound className="h-3.5 w-3.5 stroke-[3]" />
          {roster.data?.length ?? 0} builders visible
        </span>
        {currentKeeper && (
          <span className="flex items-center gap-1.5 border-[3px] border-black bg-[#ff4cbd] px-3 py-2 text-[10px] font-black uppercase">
            <Crown className="h-3.5 w-3.5 stroke-[3]" />
            {currentKeeper} holds the Cell
          </span>
        )}
      </div>

      {roster.isLoading || !roster.data ? (
        <div className="h-64 animate-pulse border-[3px] border-black bg-[#ff4cbd]" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roster.data.map((builder, index) => {
            const character = getCharacter(builder.characterId);
            const isMe = myBuilder.data?.builder?.address === builder.address;
            const holding = currentKeeper?.toLowerCase() === builder.displayName.toLowerCase();

            return (
              <motion.article
                key={builder.address}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className={`neo-card overflow-hidden p-0 ${holding ? 'bg-[#d6ff00]' : 'bg-[#fff8e7]'}`}
              >
                <div
                  className="flex items-center gap-3 border-b-[3px] border-black p-3"
                  style={{ backgroundColor: character?.fill ?? '#224cff' }}
                >
                  <CharacterAvatar characterId={builder.characterId} size="md" />
                  <div className="min-w-0 text-[#fff8e7]">
                    <p className="truncate font-poster text-2xl uppercase leading-none drop-shadow-[2px_2px_0_#101010]">
                      {builder.displayName}
                    </p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-wider">
                      @{builder.username} · {character?.title ?? 'Builder'}
                    </p>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-sm font-semibold leading-relaxed">{builder.headline}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {holding && (
                      <span className="border-2 border-black bg-[#ff4cbd] px-2 py-1 text-[9px] font-black uppercase">
                        Holding the Cell
                      </span>
                    )}
                    {isMe && (
                      <span className="border-2 border-black bg-[#224cff] px-2 py-1 text-[9px] font-black uppercase text-[#fff8e7]">
                        You
                      </span>
                    )}
                    <span className="border-2 border-black bg-white px-2 py-1 font-mono text-[9px] font-bold">
                      SEEN{' '}
                      {formatDistanceToNow(new Date(builder.lastSeenAt), { addSuffix: true }).replace(
                        ' ago',
                        '',
                      )}
                    </span>
                  </div>
                  <Link
                    href={`/u/${encodeURIComponent(builder.username)}`}
                    className="mt-4 inline-block border-2 border-black bg-[#ffe454] px-2.5 py-1.5 text-[10px] font-black uppercase"
                  >
                    View /u/{builder.username}
                  </Link>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
