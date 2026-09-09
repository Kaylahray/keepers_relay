import { EventDetailView } from '@/components/views/EventDetailView';

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EventDetailView eventId={id} />;
}
