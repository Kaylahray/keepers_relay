import { Suspense } from 'react';
import { CommunityDetailView } from '@/components/views/CommunityDetailView';

export default async function CommunityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <Suspense fallback={<div className="p-10 text-white/50">Loading…</div>}>
      <CommunityDetailView slug={slug} />
    </Suspense>
  );
}
