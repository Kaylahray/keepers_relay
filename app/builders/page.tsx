import type { Metadata } from 'next';
import { BuildersRosterView } from '@/components/views/BuildersRosterView';

export const metadata: Metadata = {
  title: 'Builders — Keepers Relay',
  description: 'See every CKB builder on the Keepers Relay roster.',
};

export default function BuildersPage() {
  return <BuildersRosterView />;
}
