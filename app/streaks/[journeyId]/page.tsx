import { ChainLetter } from '@/components/ChainLetter';

export default async function StreakPage({
  params,
}: {
  params: Promise<{ journeyId: string }>;
}) {
  const { journeyId } = await params;
  return <ChainLetter journeyId={journeyId} />;
}
