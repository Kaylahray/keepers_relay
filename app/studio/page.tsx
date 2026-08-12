import type { Metadata } from 'next';
import { ProfileStudioView } from '@/components/views/ProfileStudioView';

export const metadata: Metadata = {
  title: 'Studio — Keepers Relay',
  description: 'Mint Spore avatars, edit your profile, and unlock PROOF badges.',
};

export default function StudioPage() {
  return <ProfileStudioView />;
}
