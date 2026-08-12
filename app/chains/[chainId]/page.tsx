import type { Metadata } from 'next';
import { ChainDetailView } from '@/components/views/ChainDetailView';

export const metadata: Metadata = {
  title: 'Chain record — Keepers Relay',
  description: 'The full lineage and handoff history of a Chain Cell.',
};

export default async function ChainDetailPage({
  params,
}: {
  params: Promise<{ chainId: string }>;
}) {
  const { chainId } = await params;
  return <ChainDetailView chainId={chainId} />;
}
