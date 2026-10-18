import { VerifyView } from '@/components/crown/VerifyView';

export const metadata = {
  title: 'Check the crown',
  description: 'Replay any Crowns match straight from the CKB chain, with no server in the way.',
};

export default function VerifyPage() {
  return <VerifyView />;
}
