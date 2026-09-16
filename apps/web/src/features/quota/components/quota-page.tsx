/** Quota overview: current plan, components, period progress (route-map §3.2). */
export function QuotaPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Quota</h1>
      <p className="text-muted-foreground">
        Current plan, components, and period progress. Wired in Phase 2 (quota CRUD) with
        rule-module invariants.
      </p>
    </div>
  );
}
