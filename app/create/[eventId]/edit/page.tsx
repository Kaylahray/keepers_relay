import { redirect } from 'next/navigation';

/** Edit draft — full editor lands with DRAFT status + PATCH. For now reopen create. */
export default async function EditEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  redirect(`/events/${eventId}`);
}
