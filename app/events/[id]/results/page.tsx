import { EventResultsView } from '@/components/views/EventResultsView';

export default async function EventResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EventResultsView eventId={id} />;
}
