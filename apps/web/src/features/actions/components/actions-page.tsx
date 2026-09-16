/** Daily action plan grouped by day, priority sorted (route-map §3.6). */
export function ActionsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Actions</h1>
      <p className="text-muted-foreground">
        Today&apos;s plan and upcoming tasks. Wired in Phase 3 (`planScheduler` rule + toggling
        Server Actions).
      </p>
    </div>
  );
}
