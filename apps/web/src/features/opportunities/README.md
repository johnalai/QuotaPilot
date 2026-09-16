# features/opportunities

Owns the pipeline: table, detail, stage transitions, weighted value, and risk
signals. Routes: `/(dashboard)/opportunities` and
`/opportunities/[opportunityId]`.

**Public interface (`index.ts`):** `OpportunitiesPage`,
`OpportunityDetailPage`, `OpportunitySummary` / `OpportunityStage` / `OpportunityId`
types.

**Weighted value and risk are rule-computed** (`packages/domain/rules/`), never
entered or altered by AI — this feature renders and stage-change-triggers them
(route-map §5 `STAGE_CHANGE` revalidates opportunities + forecast + actions).

**Internal layout:** `components/` · `types.ts`. `schemas.ts`, `services.ts`,
`actions.ts` land Phase 2.
