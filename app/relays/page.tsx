import type { Metadata } from 'next';
import { RelayHubView } from '@/components/views/RelayHubView';

export const metadata: Metadata = {
  title: 'Relays — Keepers Relay',
  description: 'Community missions that move the CKB ecosystem forward.',
};

export default function RelaysPage() {
  return <RelayHubView />;
}
