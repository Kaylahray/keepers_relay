import { VerifyView } from '@/components/crown/VerifyView';

export const metadata = {
  title: 'Check a game',
  description: 'Replay any crown or duel straight from the CKB chain, with no server in the way.',
};

export default async function VerifyTxPage({ params }: { params: Promise<{ tx: string }> }) {
  const { tx } = await params;
  return <VerifyView initialTx={decodeURIComponent(tx)} />;
}
