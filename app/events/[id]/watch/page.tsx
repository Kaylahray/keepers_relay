import { LiveEventView } from '@/components/views/LiveEventView';

export default async function EventWatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LiveEventView eventId={id} spectate />;
}
