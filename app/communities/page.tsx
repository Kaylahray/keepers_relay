import type { Metadata } from 'next';
import { CommunitiesView } from '@/components/views/CommunitiesView';

export const metadata: Metadata = {
  title: 'Communities — Keepers Relay',
  description: 'Join a room and keep its Cell streaks alive.',
};

export default function CommunitiesPage() {
  return <CommunitiesView />;
}
