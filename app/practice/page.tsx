import type { Metadata } from 'next';
import { PracticeView } from '@/components/practice/PracticeView';

export const metadata: Metadata = { title: 'Practice · Crowns' };

export default function PracticePage() {
  return <PracticeView />;
}
