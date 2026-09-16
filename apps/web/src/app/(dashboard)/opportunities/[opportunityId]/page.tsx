import { OpportunityDetailPage } from '@/features/opportunities';

export default async function Page({ params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = await params;
  return <OpportunityDetailPage opportunityId={opportunityId} />;
}
