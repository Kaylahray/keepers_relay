'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { JoinHandleForm } from '@/components/JoinHandleForm';

function JoinForm() {
  const next = useSearchParams().get('next') || '/play';
  return (
    <div className="w-full px-4 pt-6 md:pt-12">
      <JoinHandleForm nextHref={next} />
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}
