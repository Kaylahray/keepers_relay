import type { Metadata } from 'next';
import { ArtifactArchiveView } from '@/components/views/ArtifactArchiveView';

export const metadata: Metadata = {
  title: 'Artifact archive — Keepers Relay',
  description: 'Every permanent mark left by past Keepers of this chain.',
};

export default async function ArtifactPage({
  params,
}: {
  params: Promise<{ chainId: string }>;
}) {
  const { chainId } = await params;
  return <ArtifactArchiveView chainId={chainId} />;
}
