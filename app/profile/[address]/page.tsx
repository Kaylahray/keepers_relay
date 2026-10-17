'use client';

import { useParams } from 'next/navigation';
import { ProfileView } from '@/components/views/ProfileView';

export default function ProfileAddressPage() {
  const params = useParams<{ address: string }>();
  const address = typeof params.address === 'string' ? params.address : 'me';
  return <ProfileView address={address} />;
}
