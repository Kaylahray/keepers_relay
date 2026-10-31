import type { Metadata } from 'next';
import { PlayHub } from '@/components/play/PlayHub';

export const metadata: Metadata = { title: 'Play · Crowns' };

export default function GamesPage() {
  return <PlayHub />;
}
