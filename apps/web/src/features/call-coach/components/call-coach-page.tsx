/**
 * Call & demo prep + objection practice hub — one of the two MVP AI features
 * (route-map §3.7/§3.8). Phase 4 wires streaming prep generation and scored
 * practice sessions over `AiService`.
 */
export function CallCoachPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Call coach</h1>
      <p className="text-muted-foreground">
        Discovery/demo prep and objection practice. Wired in Phase 4 over AiService (streaming prep
        documents, scored practice sessions).
      </p>
    </div>
  );
}
