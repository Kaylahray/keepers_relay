import type { Metadata } from 'next';
import { CrownPlayView } from '@/components/crown/CrownPlayView';
import { crownPreview } from '@/lib/server/crown-preview';

type Props = { params: Promise<{ id: string }> };

/** What chat apps show when a crown link is shared: the challenge, the pot and the clock. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const preview = await crownPreview(id);
  if (!preview) return { title: 'Crowns' };
  const title = `${preview.headline} · ${preview.title}`;
  // The round is in the image address too: chat apps remember images by address.
  const image = { url: `/play/${id}/preview?r=${preview.stage}`, width: 1200, height: 630, alt: preview.headline };
  return {
    title,
    description: preview.description,
    openGraph: { title, description: preview.description, type: 'website', siteName: 'Crowns', images: [image] },
    twitter: { card: 'summary_large_image', title, description: preview.description, images: [image.url] },
  };
}

export default async function CrownPlayPage({ params }: Props) {
  const { id } = await params;
  return <CrownPlayView id={id} />;
}
