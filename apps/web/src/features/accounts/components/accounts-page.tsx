/** Account list with filters + priority sort (route-map §3.3). */
export function AccountsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
      <p className="text-muted-foreground">
        Prioritized account list. Wired in Phase 2 (accounts CRUD + `PrioritizeAccounts` rule).
      </p>
    </div>
  );
}
