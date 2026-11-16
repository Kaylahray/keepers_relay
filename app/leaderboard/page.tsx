import type { Metadata } from 'next';
import { LeaderboardView } from '@/components/views/LeaderboardView';

export const metadata: Metadata = { title: 'Leaderboard · Crowns' };

export default function LeaderboardPage() {
  return <LeaderboardView />;
}
