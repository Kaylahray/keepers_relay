import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LaunchJourneyView } from '@/components/views/LaunchJourneyView';

export const metadata: Metadata = {
  title: 'Launch a streak — Keepers Relay',
  description: 'Start a Cell streak inside a community you belong to.',
};

export default function LaunchPage() {
  return (
    <Suspense fallback={<div className="p-8 font-semibold">Loading launch…</div>}>
      <LaunchJourneyView />
    </Suspense>
  );
}
