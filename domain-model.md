# QuotaPilot — Domain Model

**Status:** Approved for planning · **Date:** 2026-09-14
**Companion docs:** [architecture.md](architecture.md), [route-map.md](route-map.md)

---

## 0. Conventions

- **Identifiers:** `cuid2` string ids, non-enumerable, URL-safe (`org_`, `usr_`, `acc_`, `opp_`, `quo_`, `mte_`, `prep_`, `obj_`, `prc_`, `fcst_`, `risk_`, `act_`, `aiu_`, `inv_` prefixes).
- **Timestamps:** `created_at`, `updated_at` on every table, UTC. `nullable deleted_at` for soft delete on high-value tables only (Account, Opportunity, PracticeSession), using the `SoftDelete` convention.
- **Money:** integer **minor units** + ISO-4217 `currency` column. Never floats.
- **Tenancy:** every tenant-scoped table carries `organization_id` and an RLS policy reading `request.jwt.claims` (see [architecture.md](architecture.md) §7). Values marked **[T]** are tenant-scoped.
- **Audit:** minimal audit columns (`created_by`) now; full `AuditLog` is Phase 6 (roadmap).
- **Enums:** stored as PostgreSQL enums or text+check (decision at migration time; documented as enums here for clarity).
- **No tenant-scoped table may lack** `organization_id` (linted + enforced in review).

---

## 1. Entity catalog

### 1.1 Organization `[T]` _— the tenant root_

| Field                   | Type                            | Notes                                   |
| ----------------------- | ------------------------------- | --------------------------------------- |
| id                      | cuid2                           | prefix `org_`                           |
| name                    | text                            | display name                            |
| slug                    | text, unique-per-platform       | URL handle, validated                   |
| plan_tier               | enum `trial │ pro │ enterprise` | **MVP: always `pro`; billing deferred** |
| quota_currency          | ISO-4217                        | org default currency (§0)               |
| feature_flags           | jsonb                           | release gates (e.g. `{"ai_prep":true}`) |
| settings                | jsonb                           | misc org prefs                          |
| created_at / updated_at | timestamptz                     |                                         |

**Invariants:** exactly one `quota_currency` at a time; `settings` validated by zod schema.

### 1.2 User `[global, not tenant-scoped]`

| Field                   | Type         | Notes                            |
| ----------------------- | ------------ | -------------------------------- |
| id                      | cuid2        | prefix `usr_`                    |
| email                   | text, unique | normalized lowercase             |
| name                    | text         |                                  |
| password_hash           | text         | argon2id; never logged           |
| timezone                | text         | IANA tz, default UTC             |
| locale                  | text         | default `en`                     |
| onboarded_at            | timestamptz? | null until ramp wizard completes |
| created_at / updated_at | timestamptz  |                                  |

A User is **not** tenant-scoped; users belong to orgs through `Membership`. One user may hold memberships in multiple orgs (Phase 2 UX: org switcher).

### 1.3 Membership `[T]` — user ↔ org

| Field                   | Type                                  | Notes                                                                                   |
| ----------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| id                      | cuid2                                 | prefix `mem_`                                                                           |
| organization_id         | cuid2                                 | **[T]**                                                                                 |
| user_id                 | cuid2                                 |                                                                                         |
| role                    | enum `owner │ admin │ member`         | **owner** is the very first member of an org; promotion/demotion rules in service layer |
| status                  | enum `active │ invited │ deactivated` |                                                                                         |
| joined_at               | timestamptz?                          |                                                                                         |
| created_at / updated_at | timestamptz                           |                                                                                         |

**Invariants:** `organization_id + user_id` unique. An org with ≥1 active `owner` always; only an `owner` changes roles. Deactivating a member blocks access but preserves rows they authored.

### 1.4 Invite `[T]` — new-member invitation

| Field           | Type         | Notes                                          |
| --------------- | ------------ | ---------------------------------------------- |
| id              | cuid2        | prefix `inv_`, value is the token (single-use) |
| organization_id | cuid2        | **[T]**                                        |
| email           | text         | invited address                                |
| role            | role enum    | granted on accept                              |
| created_by      | cuids → usr  |                                                |
| expires_at      | timestamptz  | ~7 days                                        |
| accepted_at     | timestamptz? |                                                |

**Invariants:** token hashed at rest (sha-256); single-use; expired tokens rejected at accept.

### 1.5 QuotaPlan `[T]` — the ramp/quota target

| Field                   | Type                  | Notes                                                                                                           |
| ----------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------- |
| id                      | cuid2                 | prefix `quo_`                                                                                                   |
| organization_id         | cuid2                 | **[T]**                                                                                                         |
| name                    | text                  | e.g. "FY27 Sales Quota"                                                                                         |
| fiscal_year             | int                   |                                                                                                                 |
| period_type             | enum `quarter │ year` |                                                                                                                 |
| currency                | ISO-4217              | org currency at creation                                                                                        |
| target_amount           | money                 | minor units                                                                                                     |
| components              | jsonb                 | breakdown: `new_business, expansion, renewals, services` with amounts summing ≤ target (see §2 invariant rules) |
| owner_user_ids          | cuid2[]               | sellers this plan covers                                                                                        |
| created_at / updated_at | timestamptz           |                                                                                                                 |

**Invariants (rule module `quota.ts`):** `components` amounts must sum ≤ `target_amount`; `target_amount > 0`; only `owner` or `admin` edits QuotaPlan.

### 1.6 Account `[T]` — a customer/company the seller works

| Field                                | Type                       | Notes                                                                             |
| ------------------------------------ | -------------------------- | --------------------------------------------------------------------------------- |
| id                                   | cuid2                      | prefix `acc_`                                                                     |
| organization_id                      | cuid2                      | **[T, soft-deletable]**                                                           |
| name                                 | text                       |                                                                                   |
| website                              | text?                      |                                                                                   |
| region                               | enum?                      | open text + loose list (EMEA/US/…) — validate                                     |
| industry                             | text?                      | free-form + tagging later                                                         |
| arr_estimate                         | money?                     | approximate account value                                                         |
| tech_stack                           | jsonb?                     | buyer tech context (feeds prep prompts)                                           |
| health_flags                         | jsonb?                     | e.g. `{churn_risk: true}` — manual now                                            |
| owner_user_id                        | cuid2                      | seller responsible                                                                |
| priority_tier                        | enum `p1 │ p2 │ p3 │ none` | **Rule-computed** (§3) — stored for display, recalculated by `PrioritizeAccounts` |
| priority_score                       | float                      | 0–100, computed; never user-entered                                               |
| notes                                | text?                      |                                                                                   |
| created_at / updated_at / deleted_at | timestamptz?               |                                                                                   |

### 1.7 Opportunity `[T]` — active sales deal

| Field                                | Type                         | Notes                                                                    |
| ------------------------------------ | ---------------------------- | ------------------------------------------------------------------------ |
| id                                   | cuid2                        | prefix `opp_`                                                            |
| organization_id                      | cuid2                        | **[T, soft-deletable]**                                                  |
| account_id                           | cuid2                        | FK → Account                                                             |
| name                                 | text                         |                                                                          |
| amount                               | money                        | minor units                                                              |
| currency                             | ISO-4217                     | org currency                                                             |
| stage                                | stage enum (see §4)          | validated transition map                                                 |
| close_date                           | date                         |                                                                          |
| products                             | jsonb?                       | involved products/services (feeds demo prep)                             |
| owner_user_id                        | cuid2                        |                                                                          |
| weighted_value                       | money                        | **computed**: amount × stage weight (§3)                                 |
| source                               | enum `manual │ crm │ import` | crm deferred                                                             |
| notes                                | text?                        |                                                                          |
| risk_score                           | int 0–100                    | **computed** by `DetectRisk` (§3), not user-entered                      |
| risk_flags                           | jsonb?                       | cached signals for display: financial, technical, competition, champion… |
| created_at / updated_at / deleted_at | timestamptz?                 |                                                                          |

**Invariants:** stage transitions follow the rule module; `amount > 0`; `close_date` within a valid horizon (warn, not block, if far out).

### 1.8 Meeting `[T]` — discovery/demo/objection encounter

| Field                   | Type                                        | Notes                                            |
| ----------------------- | ------------------------------------------- | ------------------------------------------------ |
| id                      | cuid2                                       | prefix `mte_`                                    |
| organization_id         | cuid2                                       | **[T]**                                          |
| account_id              | cuid2                                       |                                                  |
| opportunity_id          | cuid2?                                      | optional link                                    |
| type                    | enum `discovery │ demo │ objection │ other` |                                                  |
| subject                 | text                                        |                                                  |
| scheduled_at            | timestamptz                                 |                                                  |
| duration_min            | int                                         |                                                  |
| attendee_summary        | jsonb?                                      | buyer personas/roles, tech stack, open questions |
| created_by              | cuid2                                       |                                                  |
| created_at / updated_at | timestamptz                                 |                                                  |

### 1.9 PrepDocument `[T]` — AI-generated prep artifact

| Field                   | Type                                                                   | Notes                                                                                         |
| ----------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| id                      | cuid2                                                                  | prefix `prep_`                                                                                |
| organization_id         | cuid2                                                                  | **[T]**                                                                                       |
| meeting_id              | cuid2?                                                                 |                                                                                               |
| account_id              | cuid2                                                                  |                                                                                               |
| kind                    | enum `discovery_guide │ demo_plan │ objection_script │ followup_email` |                                                                                               |
| content                 | jsonb                                                                  | structured sections — validated against the prompt template's output schema (§8 architecture) |
| ai_metadata             | jsonb                                                                  | `{provider, model, usageId, promptVersion, latencyMs}`                                        |
| version                 | int                                                                    | re-generating bumps version; prior versions retained                                          |
| created_by              | cuid2                                                                  |                                                                                               |
| created_at / updated_at | timestamptz                                                            |                                                                                               |

**Invariant:** `content` must validate against the **same zod output schema** the prompt template declares before being persisted (§8.2 architecture). `ai_metadata.usage_id` must reference an `AiUsage` row.

### 1.10 Objection `[T]` — org playbook entry for objection handling

| Field                   | Type                       | Notes                                  |
| ----------------------- | -------------------------- | -------------------------------------- |
| id                      | cuid2                      | prefix `obj_`                          |
| organization_id         | cuid2                      | **[T]**                                |
| key                     | text                       | canonical label, e.g. `price_too_high` |
| title                   | text                       | "It's too expensive"                   |
| severity                | enum `high │ medium │ low` | default high                           |
| talk_track              | text                       | model/suggested answer                 |
| context_notes           | text                       | why it matters for this org/industry   |
| created_by / updated_at | —                          |                                        |

**MVP source:** a curated starter library seeded per-org + user additions (maybe AI-drafted, user-approved). Public cross-org playbooks are Phase 6.

### 1.11 PracticeSession `[T]` — objection-handling practice run

| Field                        | Type        | Notes                                                                       |
| ---------------------------- | ----------- | --------------------------------------------------------------------------- |
| id                           | cuid2       | prefix `prc_`                                                               |
| organization_id              | cuid2       | **[T, soft-deletable]**                                                     |
| user_id                      | cuid2       | the practicing seller                                                       |
| objection_id                 | cuid2?      |                                                                             |
| scenario                     | text        | role-play context                                                           |
| transcript                   | jsonb       | turns: `[{role:"user                                                        | assistant", text, ts}]` |
| score                        | jsonb?      | AI feedback: `{strength_notes, feedback, rating}` — output-schema validated |
| duration_ms / token_estimate | —           | usage/cost awareness                                                        |
| created_at / updated_at      | timestamptz |                                                                             |

### 1.12 ForecastLine `[T]` — quarterly committed/best-case/pipeline

| Field                   | Type                       | Notes                                       |
| ----------------------- | -------------------------- | ------------------------------------------- |
| id                      | cuid2                      | prefix `fcst_`                              |
| organization_id         | cuid2                      | **[T]**                                     |
| quarter                 | text                       | e.g. `2027-Q1`                              |
| owner_user_id           | cuid2                      |                                             |
| committed_amount        | money                      | user-entered                                |
| best_case_amount        | money                      | user-entered                                |
| pipeline_amount         | money                      | user-entered or derived from open opps      |
| confidence              | enum `low │ medium │ high` |                                             |
| risk_notes              | text?                      |                                             |
| total                   | money                      | computed `committed + best_case + pipeline` |
| created_at / updated_at | timestamptz                |                                             |

**Invariant:** `committed ≤ best_case ≤ pipeline` validated. **Forecast risk** = rule-based flags on this line + per-opportunity `risk_score` rollups (see §3).

### 1.13 RiskSignal `[T]` — a detected risk (rule or AI)

| Field            | Type                                                                  | Notes                                 |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------- |
| id               | cuid2                                                                 | prefix `risk_`                        |
| organization_id  | cuid2                                                                 | **[T]**                               |
| opportunity_id   | cuid2?                                                                | nullable if forecast-level            |
| forecast_line_id | cuid2?                                                                | nullable; exactly one of the two set  |
| category         | enum `financial │ timing │ technical │ competition │ champion │ data` |                                       |
| severity         | enum `critical │ warning │ info`                                      |                                       |
| message          | text                                                                  | human-readable                        |
| source           | enum `rules │ ai`                                                     |                                       |
| detail           | jsonb?                                                                | structured evidence (what rule fired) |
| resolved_at      | timestamptz?                                                          | dismissed/closed                      |
| created_at       | timestamptz                                                           |                                       |

### 1.14 ActionTask `[T]` — one item on the daily action plan

| Field                   | Type                                                         | Notes                                                       |
| ----------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| id                      | cuid2                                                        | prefix `act_`                                               |
| organization_id         | cuid2                                                        | **[T]**                                                     |
| owner_user_id           | cuid2                                                        |                                                             |
| due_date                | date                                                         | "today" defaults to now                                     |
| kind                    | enum `call │ follow_up │ prep │ research │ practice │ admin` |                                                             |
| title                   | text                                                         |                                                             |
| ref                     | jsonb?                                                       | `{account_id?, opportunity_id?, meeting_id?}` optional link |
| status                  | enum `open │ done │ skipped`                                 |                                                             |
| priority                | int                                                          | sort key from `planScheduler`                               |
| source                  | enum `rule_engine │ ai │ manual`                             |                                                             |
| created_by / timestamps | —                                                            |                                                             |

### 1.15 AiUsage `[T]` — per-call AI metering

| Field                        | Type                                                                           | Notes                                   |
| ---------------------------- | ------------------------------------------------------------------------------ | --------------------------------------- |
| id                           | cuid2                                                                          | prefix `aiu_`                           |
| organization_id              | cuid2                                                                          | **[T]**                                 |
| user_id                      | cuid2                                                                          |                                         |
| feature                      | enum `prep_discovery │ prep_demo │ objection_practice │ plan_ai │ forecast_ai` |                                         |
| provider                     | enum `anthropic │ openai │ google`                                             |                                         |
| model                        | text                                                                           | exact model id                          |
| prompt_version               | text?                                                                          |                                         |
| input_tokens / output_tokens | int                                                                            |                                         |
| duration_ms                  | int                                                                            |                                         |
| cost_usd_estimate            | numeric?                                                                       | derived from token counts × model rates |
| created_at                   | timestamptz                                                                    |                                         |

**Purpose:** per-org caps (§ architecture 8.2), usage surfacing, cost reconciliation. Written by `AiService` on completion (stream end).

### 1.16 Preview of deferred entities (Phase 2+, slots only)

`ExternalAccountLink` (CRM mapping), `BillingSubscription`/`Plan`, `AuditLog`, `AiPlaybookShare` (cross-org playbooks), `TeamGoal`. Not modeled in detail — do not create tables yet.

---

## 2. Relationship diagram

```
Organization 1 ── * Membership * ── 1 User
Organization 1 ── * Invite
Organization 1 ── * QuotaPlan
Organization 1 ── * Account 1 ── * Opportunity
Account 1 ── * Meeting             Opportunity 1 ── * RiskSignal
Meeting ── 1 PrepDocument 1..*     ForecastLine 1 ── * RiskSignal
Organization 1 ── * Objection ── * PracticeSession
User 1 ── * PracticeSession        User 1 ── * ActionTask
Organization 1 ── * ForecastLine    Organization 1 ── * AiUsage
```

Every arrow above is tenant-consistent: nested entities must share their root `organization_id` (enforced by repository+nothing cross-org writes).

---

## 3. Rule modules (pure functions) — the computational heart

These live in `src/domain/rules/` and are **pure** (no I/O, no Prisma) → fully unit-testable.

| Module          | Function                              | Output                           | Key logic (MVP)                                                                                                                                                                                                           |
| --------------- | ------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `priority.ts`   | `scoreAccount`                        | `priority_tier, priority_score`  | arr × strategic-lift weight × buyer-fit + named accounts; P1 = high score                                                                                                                                                 |
| `forecast.ts`   | `weightedOpportunity`                 | `weighted_value`                 | stage weight map: discovery 0.10, qualification 0.30, technical_eval 0.55, negotiation 0.80, close_won 1.00                                                                                                               |
| `risk.ts`       | `scoreOpportunity` / `signalForecast` | `risk_score 0–100, RiskSignal[]` | rules: stage-aware deal slippage, no-champion, low technical fit, under-represented in forecast, long-stale activity, competition, quotes, close-date horizon                                                             |
| `plan.ts`       | `schedulePlan`                        | `ActionTask[]`                   | deterministic daily plan: P1 outreach, upcoming meetings → prep, stale P1 follow-ups, forecast review cadence, practice target                                                                                            |
| `quota-calc.ts` | `calculateQuotaPlan`                  | `QuotaCalcOutput`                | backward funnel from quota: attempts → first meetings → discovery → qualified → wins (⌈·⌉ rounding); pipeline value = max(quota×coverage, opps×avgDeal); monthly/weekly pacing; pure math, **no AI** (decided 2026-09-15) |

Rules are **heuristics + arithmetic** in MVP; ML forecasting is a documented non-goal until Phase 7. Rule outputs that look too clever are sandbagged by deterministic tiebreakers.

---

## 4. Enumerations

- `role`: `owner │ admin │ member`
- `membership.status`: `active │ invited │ deactivated`
- `plan_tier`: `trial │ pro │ enterprise`
- `quota.period_type`: `quarter │ year`
- `account.priority_tier`: `p1 │ p2 │ p3 │ none`
- `opportunity.stage`: `discovery │ qualification │ technical_eval │ negotiation │ won │ lost │ archived` (transition map in `rules/forecast.ts`)
- `meeting.type`: `discovery │ demo │ objection │ other`
- `prep.kind`: `discovery_guide │ demo_plan │ objection_script │ followup_email`
- `objection.severity`: `high │ medium │ low`
- `forecast.confidence`: `low │ medium │ high`
- `risk.category`: `financial │ timing │ technical │ competition │ champion │ data`
- `risk.severity`: `critical │ warning │ info`
- `risk.source`: `rules │ ai`
- `task.kind`: `call │ follow_up │ prep │ research │ practice │ admin`
- `task.status`: `open │ done │ skipped`
- `task.source`: `rule_engine │ ai │ manual`
- `aius.feature`: `prep_discovery │ prep_demo │ objection_practice │ plan_ai │ forecast_ai`
- `provider`: `anthropic │ openai │ google`

---

## 5. Cross-cutting invariants (enforced by service layer + validated at write)

1. **One currency per org per quota period** (multi-currency conversion out of MVP).
2. **Weighted values & risk scores are never user-entered** — stored, display-only; recomputed by rule modules on triggers (stage change, amount change, close-date change, weekly cron).
3. **AI output is never the source of truth for financial fields**: amounts/forecast change only via user actions; AI may propose, never persist directly into `amount`/`committed_amount`.
4. **Every tenant query carries `organization_id`** (repository contract) and RLS is the backstop (architecture §7).
5. **Soft-deleted rows** (Account/Opportunity/PracticeSession) excluded from all default queries; caretakers can restore within 30 days.

## 6. Open domain questions

1. Should an org support **multiple QuotaPlans** (team quota vs individual quota) in MVP? **Assumption: one plan per org; per-seller splits via `owner_user_ids`.** Flag if multi-plan is required.
2. Objection starter library: per-org seeded or cross-org shared catalog first? **Assumption: seeded per-org from a curated starter file.**
3. Do we need multi-currency at all in MVP? **Assumption: single org currency; revisit at MVP review.**
