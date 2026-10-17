import { OpenCrownView } from '@/components/crown/OpenCrownView';
import { Suspense } from 'react';

export default function CreatePage() {
  return (
    <Suspense>
      <OpenCrownView />
    </Suspense>
  );
}
