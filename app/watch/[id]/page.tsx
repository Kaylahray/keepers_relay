import { CrownWatchView } from '@/components/crown/CrownWatchView';

export default async function CrownWatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CrownWatchView id={id} />;
}
