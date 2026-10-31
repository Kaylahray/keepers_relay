import type { Metadata } from 'next';
import { DuelView } from '@/components/duel/DuelView';

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: 'Duel · Crowns' };

export default async function DuelPage({ params }: Props) {
  const { id } = await params;
  return <DuelView id={id} />;
}
