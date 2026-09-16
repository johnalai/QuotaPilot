import { AccountDetailPage } from '@/features/accounts';

export default async function Page({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  return <AccountDetailPage accountId={accountId} />;
}
