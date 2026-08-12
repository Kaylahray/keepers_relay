import type { Metadata } from 'next';
import { RelayDetailView } from '@/components/views/RelayDetailView';

export const metadata: Metadata = {
  title: 'Relay — Keepers Relay',
  description: 'Complete a CKB Relay, submit proof, and claim your contribution reward.',
};

export default async function RelayDetailPage({
  params,
}: {
  params: Promise<{ relayId: string }>;
}) {
  const { relayId } = await params;
  return <RelayDetailView relayId={relayId} />;
}
