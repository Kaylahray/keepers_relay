'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Shield } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import {
  useCommunityQuery,
  useGrantCommunityPoints,
} from '@/hooks/useCommunity';
import { useMyBuilder } from '@/hooks/useBuilder';
import { useWallet } from '@/hooks/useWallet';

export function CommunityAdminView({ slug }: { slug: string }) {
  const { address, isConnected, connect } = useWallet();
  const myBuilder = useMyBuilder();
  const detail = useCommunityQuery(slug);
  const grant = useGrantCommunityPoints();
  const me = myBuilder.data?.builder;

  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState(10);
  const [note, setNote] = useState('');

  const community = detail.data?.community;
  const events = detail.data?.events ?? [];
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
      intro="Grant points to members. Event pots are managed on each event."
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
              Grant points to a member
            </p>
            <p className="mt-2 text-xs font-semibold text-black/70">
              Adds points to a member&apos;s balance.
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
              <p className="mt-3 text-xs font-semibold text-[#ff2d55]">{grant.error.message}</p>
            )}
            <button
              type="button"
              disabled={!recipientAddress || grant.isPending}
              onClick={() =>
                grant.mutate({
                  address: address!,
                  slug,
                  recipientAddress,
                  amount,
                  note: note.trim() || undefined,
                })
              }
              className="neo-button mt-4 bg-[#99ee2d] px-4 py-3 text-xs font-black uppercase text-black disabled:opacity-50"
            >
              {grant.isPending ? 'Granting…' : 'Grant points'}
            </button>
          </section>

          <section className="neo-card bg-white p-5">
            <p className="text-[10px] font-black uppercase tracking-wider">Room events</p>
            <p className="mt-2 text-xs font-semibold text-black/70">
              {events.length} event{events.length === 1 ? '' : 's'} linked to this community.
            </p>
            <ul className="mt-4 space-y-2">
              {events.slice(0, 8).map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/events/${e.id}`}
                    className="text-sm font-bold underline decoration-2 underline-offset-2"
                  >
                    {e.name}
                  </Link>
                  <span className="ml-2 font-mono text-[10px] uppercase text-black/50">
                    {e.status}
                  </span>
                </li>
              ))}
              {events.length === 0 && (
                <li className="text-xs font-semibold text-black/50">No events yet.</li>
              )}
            </ul>
            <Link
              href={`/create?community=${encodeURIComponent(community.id)}`}
              className="neo-button mt-5 inline-flex bg-[#224cff] px-4 py-3 text-xs font-black uppercase text-[#fff8e7]"
            >
              Create event here
            </Link>
          </section>
        </div>
      )}
    </PageShell>
  );
}
