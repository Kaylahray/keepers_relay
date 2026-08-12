import type { Metadata } from 'next';
import { ProfileView } from '@/components/views/ProfileView';

export const metadata: Metadata = {
  title: 'Passport — Keepers Relay',
  description: 'Contribution proof, relay history, and Keeper turns.',
};

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return <ProfileView address={address} />;
}
