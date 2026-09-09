import type { Metadata } from 'next';
import { ProfileView } from '@/components/views/ProfileView';

export const metadata: Metadata = {
  title: 'Profile — Keepers Relay',
  description: 'Your avatar, stats, communities, and event history.',
};

export default async function ProfileAddressPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return <ProfileView address={address} />;
}
