import type { Metadata } from 'next';
import { RallyView } from '@/components/rally/RallyView';
import { racePreview } from '@/lib/server/race-preview';

type Props = { params: Promise<{ id: string }> };

/** What chat apps show when a race link is shared: the track, the stake and the clock, or who won. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const preview = await racePreview(id).catch(() => null);
  if (!preview) return { title: 'Race · Crowns' };
  const title = `${preview.headline} · Crowns`;
  // The stage is in the image address too: chat apps remember images by address.
  const image = { url: `/rally/${id}/preview?s=${preview.stage}`, width: 1200, height: 630, alt: preview.headline };
  return {
    title,
    description: preview.description,
    openGraph: { title, description: preview.description, type: 'website', siteName: 'Crowns', images: [image] },
    twitter: { card: 'summary_large_image', title, description: preview.description, images: [image.url] },
  };
}

export default async function RallyDuelPage({ params }: Props) {
  const { id } = await params;
  return <RallyView id={id} />;
}
