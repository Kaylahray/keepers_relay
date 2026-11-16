import type { Metadata } from 'next';
import { RallyHome } from '@/components/rally/RallyHome';

export const metadata: Metadata = { title: 'Race · Crowns' };

export default function RallyPage() {
  return <RallyHome />;
}
