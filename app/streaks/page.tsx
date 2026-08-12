import type { Metadata } from 'next';
import { StreaksView } from '@/components/views/StreaksView';

export const metadata: Metadata = {
  title: 'Streaks — Keepers Relay',
  description: 'Watch every living Cell across communities. Join a room to hold or pass.',
};

export default function StreaksIndexPage() {
  return <StreaksView />;
}
