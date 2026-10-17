import { CrownDeskView } from '@/components/crown/CrownDeskView';

export default async function CrownHostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CrownDeskView id={id} />;
}
