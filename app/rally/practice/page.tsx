import type { Metadata } from 'next';
import { RallyPractice } from '@/components/rally/RallyPractice';

export const metadata: Metadata = { title: 'Practice · Crowns' };

export default function RallyPracticePage() {
  return <RallyPractice />;
}
