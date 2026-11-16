import type { Metadata } from 'next';
import { RallyView } from '@/components/rally/RallyView';

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: 'Race · Crowns' };

export default async function RallyDuelPage({ params }: Props) {
  const { id } = await params;
  return <RallyView id={id} />;
}
