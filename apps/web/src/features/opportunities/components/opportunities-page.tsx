/** Pipeline table: amount, weighted value, stage, risk chip (route-map §3.4). */
export function OpportunitiesPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Opportunities</h1>
      <p className="text-muted-foreground">
        Pipeline with weighted value and risk flags. Wired in Phase 2 (opportunities CRUD + stage
        transition validation).
      </p>
    </div>
  );
}
