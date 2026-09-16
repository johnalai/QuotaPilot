# features/weekly-review

Owns the forecast snapshot and risk flags surfaced in the weekly review and on
the dashboard. Route: `/(dashboard)/weekly-review` (forecast drill-down /
`[quarter]` arrives with Phase 3).

**Public interface (`index.ts`):** `WeeklyReviewPage`, `RiskSnapshotCard`
(dashboard tile), `ForecastQuarter` / `RiskSignalSummary` + enum types.

**Money & risk are invariant-bearing:** `committed ≤ best_case ≤ pipeline`
validated at write; risk signals are rule/AI-detected, never hand-entered
(domain-model §5). Those rules live in `packages/domain/rules/`.

**Internal layout:** `components/` · `types.ts`. `schemas.ts`, `services.ts`,
`actions.ts` (SET_FORECAST_VALUES, RECOMPUTE) land Phase 3.
