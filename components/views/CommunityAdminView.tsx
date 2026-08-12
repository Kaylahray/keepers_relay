'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Coins, Loader2, Shield } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import {
  useCommunityQuery,
  useGrantCommunityProof,
} from '@/hooks/useCommunity';
import { useFundJourney } from '@/hooks/useChain';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useWallet } from '@/hooks/useWallet';

export function CommunityAdminView({ slug }: { slug: string }) {
  const { address, isConnected, connect } = useWallet();
  const myBuilder = useMyBuilder();
  const detail = useCommunityQuery(slug);
  const grant = useGrantCommunityProof();
  const fund = useFundJourney();
  const me = myBuilder.data?.builder;

  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState(10);
  const [note, setNote] = useState('');
  const [potAmount, setPotAmount] = useState(10);
  const [potJourneyId, setPotJourneyId] = useState('');

  const community = detail.data?.community;
  const streaks = detail.data?.streaks ?? [];
  const members = detail.data?.members ?? [];

  if (detail.isLoading) {
    return (
      <PageShell eyebrow="Admin" title="Loading…" backHref={`/communities/${slug}`}>
        <Loader2 className="h-6 w-6 animate-spin" />
      </PageShell>
    );
  }

  if (!community) {
    return (
      <PageShell eyebrow="Admin" title="Not found" backHref="/communities">
        <p className="text-sm font-semibold">Community missing.</p>
      </PageShell>
    );
  }

  const isCreator = !!address && community.creatorAddress === address && !!me?.onboarded;

  return (
    <PageShell
      eyebrow="Community admin"
      title={community.name}
      intro="Grant PROOF to members and fund streak pots."
      backHref={`/communities/${slug}`}
      backLabel="Back to room"
    >
      {!isConnected ? (
        <button
          type="button"
          onClick={() => connect()}
          className="neo-button bg-[#224cff] px-4 py-3 text-xs font-black uppercase text-[#fff8e7]"
        >
          Connect wallet
        </button>
      ) : !isCreator ? (
        <p className="border-[3px] border-black bg-[#ffe454] p-4 text-sm font-semibold">
          Only the community creator can use this panel.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="neo-card bg-[#fff8e7] p-5">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
              <Shield className="h-3.5 w-3.5 stroke-[3]" />
              Grant PROOF to a member
            </p>
            <p className="mt-2 text-xs font-semibold text-black/70">
              Adds PROOF to a member&apos;s passport.
            </p>
            <label className="mt-4 block text-xs font-semibold">
              Member
              <select
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                className="mt-1 w-full border-[3px] border-black bg-white px-3 py-2 font-mono text-xs"
              >
                <option value="">Select member…</option>
                {members.map((m) => (
                  <option key={m.address} value={m.address}>
                    {m.username ? `@${m.username}` : m.displayName} · {m.address.slice(0, 12)}…
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-xs font-semibold">
              Amount
              <input
                type="number"
                min={1}
                max={10000}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="mt-1 w-full border-[3px] border-black bg-white px-3 py-2 font-mono text-xs"
              />
            </label>
            <label className="mt-3 block text-xs font-semibold">
              Note (optional)
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={120}
                className="mt-1 w-full border-[3px] border-black bg-white px-3 py-2 text-xs"
              />
            </label>
            {grant.error && (
              <p className="mt-2 text-sm font-bold text-red-800">{grant.error.message}</p>
            )}
            {grant.isSuccess && (
              <p className="mt-2 text-sm font-bold text-green-800">
                Granted {grant.data.granted} PROOF → balance {grant.data.recipient.proofBalance}
              </p>
            )}
            <button
              type="button"
              disabled={!address || !recipientAddress || grant.isPending}
              onClick={() =>
                address &&
                grant.mutate({
                  address,
                  slug,
                  recipientAddress,
                  amount,
                  note: note.trim() || undefined,
                })
              }
              className="neo-button mt-4 flex items-center gap-2 bg-[#d6ff00] px-4 py-3 text-xs font-black uppercase disabled:opacity-40"
            >
              {grant.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4 stroke-[3]" />}
              Grant PROOF
            </button>
          </section>

          <section className="neo-card bg-[#ffe454] p-5">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
              <Coins className="h-3.5 w-3.5 stroke-[3]" />
              Fund a streak pot
            </p>
            <p className="mt-2 text-xs font-semibold text-black/70">
              Move PROOF from your balance into a streak pot.
            </p>
            <label className="mt-4 block text-xs font-semibold">
              Streak
              <select
                value={potJourneyId}
                onChange={(e) => setPotJourneyId(e.target.value)}
                className="mt-1 w-full border-[3px] border-black bg-white px-3 py-2 text-xs"
              >
                <option value="">Select streak…</option>
                {streaks
                  .filter((s) => s.status === 'alive')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.creatureName} · pot {s.rewardPoolProof}
                    </option>
                  ))}
              </select>
            </label>
            <label className="mt-3 block text-xs font-semibold">
              Amount (you have {me?.proofBalance ?? 0})
              <input
                type="number"
                min={1}
                max={me?.proofBalance ?? 0}
                value={potAmount}
                onChange={(e) => setPotAmount(Number(e.target.value))}
                className="mt-1 w-full border-[3px] border-black bg-white px-3 py-2 font-mono text-xs"
              />
            </label>
            {fund.error && (
              <p className="mt-2 text-sm font-bold text-red-800">{fund.error.message}</p>
            )}
            <button
              type="button"
              disabled={!address || !potJourneyId || fund.isPending}
              onClick={() =>
                address &&
                fund.mutate({
                  journeyId: potJourneyId,
                  address,
                  amount: potAmount,
                })
              }
              className="neo-button mt-4 bg-[#224cff] px-4 py-3 text-xs font-black uppercase text-[#fff8e7] disabled:opacity-40"
            >
              Fund pot
            </button>

            <div className="mt-6 border-t-[3px] border-black pt-4">
              <p className="text-[10px] font-black uppercase tracking-wider">Live streaks</p>
              <ul className="mt-2 space-y-2">
                {streaks.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-xs font-semibold">
                    <span>
                      {s.creatureName} · #{s.holderCount} · {s.status}
                    </span>
                    <Link href={`/streaks/${s.id}`} className="underline">
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={`/launch?community=${community.id}`}
                className="mt-3 inline-block text-xs font-black uppercase underline"
              >
                Launch another streak in this room →
              </Link>
            </div>
          </section>
        </div>
      )}
    </PageShell>
  );
}
