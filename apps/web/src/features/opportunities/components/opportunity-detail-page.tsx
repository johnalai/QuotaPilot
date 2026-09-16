export interface OpportunityDetailPageProps {
  opportunityId: string;
}

/**
 * Opportunity detail: stage progress, risk signals, revenue notes (user-entered
 * only — AI never writes financial fields), forecast placement. The
 * `opportunityId` arrives from the dynamic route segment.
 */
export function OpportunityDetailPage({ opportunityId }: OpportunityDetailPageProps) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Opportunity</h1>
      <p className="text-muted-foreground">
        Detail view for <span className="tabular-nums text-foreground">{opportunityId}</span> —
        loads in Phase 2.
      </p>
    </div>
  );
}
