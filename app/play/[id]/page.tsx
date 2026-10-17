import { CrownPlayView } from '@/components/crown/CrownPlayView';

export default async function CrownPlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CrownPlayView id={id} />;
}
