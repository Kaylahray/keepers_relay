import type { Metadata } from 'next';
import { PracticeView } from '@/components/practice/PracticeView';
import { DepthsPractice } from '@/components/practice/DepthsPractice';

export const metadata: Metadata = { title: 'Practice · Crowns' };

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  const { game } = await searchParams;
  return game === 'depths' ? <DepthsPractice /> : <PracticeView />;
}
