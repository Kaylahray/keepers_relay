'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { ArenaStage } from '@/components/arena/ArenaStage';
import { ArenaCta } from '@/components/arena/ArenaPrimitives';
import { EventFeatureCard } from '@/components/arena/EventFeatureCard';
import { useWallet } from '@/hooks/useWallet';
import { useEventsQuery } from '@/hooks/useEvents';
import type { EventSummary } from '@/types/event';

/** Host dashboard — upcoming / live / completed for the connected wallet. */
export function HostDashboardView() {
  const { address, isConnected, connect } = useWallet();
  const eventsQ = useEventsQuery();
  const all = eventsQ.data?.events ?? [];
  const mine = address
    ? all.filter((e) => (e.hostAddress ?? '').toLowerCase() === address.toLowerCase())
    : [];

  const live = mine.filter((e) => e.status === 'live' || e.status === 'paused');
  const upcoming = mine.filter((e) => e.status === 'registration' || e.status === 'ready');
  const done = mine.filter((e) => e.status === 'finished' || e.status === 'settled');

  return (
    <ArenaStage backHref="/events" backLabel="Events">
      <div className="mb-10 max-w-xl">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#99ee2d]">
          Host
        </p>
        <h1 className="mt-3 font-poster text-[clamp(2.4rem,5vw,3.75rem)] uppercase leading-[0.92] text-white">
          Your events
        </h1>
        <p className="mt-3 text-sm font-light leading-relaxed text-white/55">
          Create, publish, and run live multiplayer nights. Live rules lock once the event starts.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {!isConnected ? (
            <ArenaCta onClick={() => connect()}>Connect wallet</ArenaCta>
          ) : (
            <ArenaCta href="/create">Create event</ArenaCta>
          )}
          <Link
            href="/events"
            className="border-b border-[#bef970] pb-1 text-sm font-bold uppercase tracking-wide text-white"
          >
            Browse all →
          </Link>
        </div>
      </div>

      {!isConnected ? (
        <p className="text-sm text-white/55">Connect to see events you host.</p>
      ) : eventsQ.isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      ) : mine.length === 0 ? (
        <p className="text-sm text-white/55">
          No events yet.{' '}
          <Link href="/create" className="text-[#99ee2d] underline">
            Create one
          </Link>
        </p>
      ) : (
        <div className="space-y-12">
          <HostSection title="Live" items={live} />
          <HostSection title="Upcoming" items={upcoming} />
          <HostSection title="Completed" items={done} />
        </div>
      )}
    </ArenaStage>
  );
}

function HostSection({ title, items }: { title: string; items: EventSummary[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-5 font-poster text-2xl uppercase text-white sm:text-3xl">{title}</h2>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((event, i) => (
          <li key={event.id}>
            <EventFeatureCard event={event} artIndex={i} />
          </li>
        ))}
      </ul>
    </section>
  );
}
