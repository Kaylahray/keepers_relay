import { EventWaitView } from '@/components/views/EventWaitView';

export default async function WaitingRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EventWaitView eventId={id} />;
}
