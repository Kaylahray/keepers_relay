import { redirect } from 'next/navigation';

/** @deprecated use /waiting */
export default async function WaitRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/events/${id}/waiting`);
}
