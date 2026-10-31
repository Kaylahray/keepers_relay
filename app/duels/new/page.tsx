import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NewDuelView } from '@/components/duel/NewDuelView';

export const metadata: Metadata = { title: 'New duel · Crowns' };

export default function NewDuelPage() {
  return (
    <Suspense>
      <NewDuelView />
    </Suspense>
  );
}
