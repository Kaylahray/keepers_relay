'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Award, Crown, Flame, Scroll, ShieldCheck, WalletMinimal } from 'lucide-react';
import { useChainQuery } from '@/hooks/useChain';
import {
  usePassportQuery,
  useRelayAttemptsQuery,
  useRelayBoardQuery,
} from '@/hooks/useKeeperEcosystem';
import { PageShell } from '@/components/PageShell';
import { RelayStatusBadge } from '@/components/RelayStatusBadge';

export function ProfileView({ address }: { address: string }) {
  const isSelf = address === 'me';
  const passport = usePassportQuery();
  const board = useRelayBoardQuery();
  const attempts = useRelayAttemptsQuery();
  const { data: chain } = useChainQuery();

  const displayName = isSelf ? passport.data?.displayName ?? 'You' : decodeURIComponent(address);
  const keeperTurns = (chain?.owners ?? []).filter(
    (owner) => owner.name.toLowerCase() === displayName.toLowerCase(),
  );
  const holdingNow =
    chain && chain.owners[chain.owners.length - 1]?.name.toLowerCase() === displayName.toLowerCase();
  const holderNumber =
    keeperTurns.length > 0
      ? (chain?.owners.findIndex((o) => o.name.toLowerCase() === displayName.toLowerCase()) ?? -1) +
        1
      : null;

  return (
    <PageShell
      eyebrow={isSelf ? 'Your proof passport' : 'Keeper profile'}
      title={displayName}
      intro={
        isSelf
          ? 'Receipts for helping the chain stay alive.'
          : 'A public record of how this person has carried the Chain Cell.'
      }
      backHref="/"
      backLabel="Home"
    >
      {isSelf && passport.data?.address && (
        <div className="mb-6 flex flex-wrap items-center gap-3 border-[3px] border-black bg-black p-4 text-[#fff8e7] shadow-[6px_6px_0_#ff4cbd]">
          <WalletMinimal className="h-5 w-5 shrink-0 stroke-[3] text-[#d6ff00]" />
          <code className="border-2 border-[#fff8e7] px-2 py-1 font-mono text-[10px]">
            {passport.data.address}
          </code>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          {chain && (
            <section className="neo-card bg-[#d6ff00] p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.16em]">
                Cells I&rsquo;ve kept alive
              </p>
              <h2 className="mt-2 font-poster text-3xl uppercase leading-none">
                {chain.creatureName}
              </h2>
              {holderNumber ? (
                <p className="mt-3 text-sm font-semibold">
                  Holder #{holderNumber}
                  {holdingNow ? ' · holding now' : ''}
                  {chain.status === 'returned' ? ' · journey came home' : ''}
                </p>
              ) : (
                <p className="mt-3 text-sm font-semibold">
                  Not on this lineage.
                </p>
              )}
              <p className="mt-2 font-mono text-[10px] font-bold">
                {chain.owners.length} holders · {chain.mode === 'return_home' ? 'return home' : 'open'}
              </p>
            </section>
          )}

          {isSelf && passport.data && (
            <section className="neo-card bg-[#ff4cbd] p-5">
              <div className="flex items-center gap-2 border-b-[3px] border-black pb-4">
                <ShieldCheck className="h-5 w-5 stroke-[3]" />
                <span className="text-[10px] font-black uppercase tracking-[0.16em]">
                  Contribution passport
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Tile
                  icon={<Flame className="h-5 w-5 stroke-[3]" />}
                  value={String(passport.data.relayStreak)}
                  label="Relay streak"
                  bg="#ffe454"
                />
                <Tile
                  icon={<Award className="h-5 w-5 stroke-[3]" />}
                  value={String(passport.data.contributionXp)}
                  label="XP earned"
                  bg="#d6ff00"
                />
                <Tile
                  icon={<Scroll className="h-5 w-5 stroke-[3]" />}
                  value={String(passport.data.artifactCount)}
                  label="Marks left"
                  bg="#fff8e7"
                />
                <Tile
                  icon={<Crown className="h-5 w-5 stroke-[3]" />}
                  value={String(passport.data.keeperTurns)}
                  label="Keeper turns"
                  bg="#224cff"
                  light
                />
              </div>
              <div className="mt-4 border-[3px] border-black bg-[#fff8e7] p-3">
                <p className="text-[10px] font-black uppercase tracking-wider">Proof collected</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {passport.data.badgeLabels.map((badge) => (
                    <span
                      key={badge}
                      className="border-2 border-black bg-[#224cff] px-2 py-1 text-[10px] font-black text-[#fff8e7]"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section className="neo-card bg-[#fff8e7] p-5">
            <h2 className="font-poster text-2xl uppercase leading-none">Keeper history</h2>
            {keeperTurns.length === 0 ? (
              <p className="mt-3 text-sm font-semibold leading-relaxed">
                {isSelf
                  ? 'You have not held the Cell yet. Join the handoff queue and make a promise the Keeper cannot ignore.'
                  : 'No recorded turns holding this Chain Cell.'}
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {keeperTurns.map((owner) => (
                  <li key={owner.id} className="border-2 border-black bg-white p-3">
                    <p className="text-xs font-black uppercase">
                      {owner.passedAt ? 'Passed it on' : 'Holding now'}
                    </p>
                    <code className="font-mono text-[10px] font-bold text-black/60">
                      {owner.cellHash}
                    </code>
                    <p className="mt-1 font-mono text-[10px] font-bold">
                      Received{' '}
                      {formatDistanceToNow(new Date(owner.receivedAt), { addSuffix: true })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {holdingNow && (
              <p className="mt-4 border-2 border-black bg-[#d6ff00] px-2.5 py-2 text-[10px] font-black uppercase">
                Currently holds the Keeper Pass
              </p>
            )}
          </section>
        </div>

        <section className="neo-card bg-[#224cff] p-5 text-[#fff8e7]">
          <h2 className="font-poster text-3xl uppercase leading-none">Relay record</h2>
          <p className="mt-2 text-sm font-semibold leading-relaxed">
            {isSelf
              ? 'Every mission you have started, proved, or claimed.'
              : 'Relay record for this Keeper.'}
          </p>

          {isSelf && board.data && attempts.data ? (
            <ul className="mt-5 space-y-3">
              {board.data.relays.map((relay) => {
                const attempt = attempts.data[relay.id];
                return (
                  <li key={relay.id} className="border-[3px] border-black bg-[#fff8e7] p-3.5 text-black">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wider">
                          {relay.partner}
                        </p>
                        <h3 className="mt-0.5 text-sm font-black uppercase">{relay.title}</h3>
                      </div>
                      <RelayStatusBadge status={attempt.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-bold">
                        {attempt.claimedAt
                          ? `CLAIMED ${new Date(attempt.claimedAt).toLocaleDateString()}`
                          : `+${relay.rewardXp} XP AVAILABLE`}
                      </span>
                      <Link
                        href={`/relays/${relay.id}`}
                        className="border-2 border-black bg-[#d6ff00] px-2.5 py-1.5 text-[10px] font-black uppercase"
                      >
                        {attempt.status === 'claimed' ? 'View receipt' : 'Continue'}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-5 border-2 border-[#fff8e7] p-4 text-xs font-bold">
              Nothing to show here yet.
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}

function Tile({
  icon,
  value,
  label,
  bg,
  light,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  bg: string;
  light?: boolean;
}) {
  return (
    <div
      className="border-[3px] border-black p-3"
      style={{ backgroundColor: bg, color: light ? '#fff8e7' : '#101010' }}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="font-mono text-2xl font-bold">{value}</span>
      </div>
      <p className="mt-2 text-[10px] font-black uppercase tracking-wider">{label}</p>
    </div>
  );
}
