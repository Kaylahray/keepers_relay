'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { JoinHandleForm } from '@/components/JoinHandleForm';

function JoinForm() {
  const next = useSearchParams().get('next') || '/rally';
  return <JoinHandleForm nextHref={next} />;
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}
