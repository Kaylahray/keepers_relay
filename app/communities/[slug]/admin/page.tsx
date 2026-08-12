import { CommunityAdminView } from '@/components/views/CommunityAdminView';

export default async function CommunityAdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <CommunityAdminView slug={slug} />;
}
