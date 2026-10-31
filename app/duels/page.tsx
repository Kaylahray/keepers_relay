import type { Metadata } from 'next';
import { DuelsHome } from '@/components/duel/DuelsHome';

export const metadata: Metadata = { title: 'Duels · Crowns' };

export default function DuelsPage() {
  return <DuelsHome />;
}
