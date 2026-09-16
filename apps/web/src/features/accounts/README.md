# features/accounts

Owns accounts CRUD, prioritization display, and the account detail (profile,
health, opportunities, next best prep). Routes: `/(dashboard)/accounts` and
`/accounts/[accountId]`.

**Public interface (`index.ts`):** `AccountsPage`, `AccountDetailPage`,
`AccountSummary` / `AccountId` / `PriorityTier` types.

**Priority** is rule-computed (`packages/domain/rules/priority.ts`), never
user-entered — this feature persists and renders it, Phase 2.

**Internal layout:** `components/` · `types.ts`. `schemas.ts`, `services.ts`,
and `actions.ts` (CREATE/UPDATE/DELETE_ACCOUNT) land Phase 2.
