/** Weekly review: what worked / didn't, forecast snapshot, risk flags. */
export function WeeklyReviewPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Weekly review</h1>
      <p className="text-muted-foreground">
        Forecast snapshot and risk signals. Wired in Phase 3 (forecast + `DetectRisk`).
      </p>
    </div>
  );
}
