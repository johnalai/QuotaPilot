export interface AccountDetailPageProps {
  accountId: string;
}

/**
 * Account detail: profile, health flags, opportunities, next best prep
 * (route-map §3.3). `accountId` arrives from the dynamic route segment.
 */
export function AccountDetailPage({ accountId }: AccountDetailPageProps) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Account</h1>
      <p className="text-muted-foreground">
        Detail view for <span className="tabular-nums text-foreground">{accountId}</span> — loads in
        Phase 2.
      </p>
    </div>
  );
}
