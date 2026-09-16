# features/call-coach

Owns the two MVP AI copilots: **prep** (discovery/demo documents) and
**objection practice** (scored role-play). Route: `/(dashboard)/call-coach`
(prep builder / session routes arrive Phase 4).

**Public interface (`index.ts`):** `CallCoachPage`, `PrepDocumentSummary`,
`PracticeSessionSummary`, `PrepKind`.

**AI boundary (architecture §8):** all model calls go through `AiService` +
provider registry; prompts are versioned templates in `packages/prompts`;
usage is metered (`AiUsage`); output never writes financial fields.

**Internal layout:** `components/` · `types.ts`. `schemas.ts` (prep builder /
practice turn zod), `services.ts` (GeneratePrep, PracticeTurn, ScorePractice),
`actions.ts`, and the streaming Route Handlers land Phase 4.
