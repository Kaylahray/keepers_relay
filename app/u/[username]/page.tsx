import type { Metadata } from 'next';
import { PublicProfileView } from '@/components/views/PublicProfileView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username} — Keepers Relay`,
    description: `Public on-chain profile for @${username} on Keepers Relay.`,
  };
}

export default async function PublicUsernamePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <PublicProfileView username={username} />;
}
