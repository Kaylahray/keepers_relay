import { Suspense } from 'react';
import { CreateEventView } from '@/components/views/CreateEventView';

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="p-10 text-white/50">Loading…</div>}>
      <CreateEventView />
    </Suspense>
  );
}
