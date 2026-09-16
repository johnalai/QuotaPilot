# QuotaPilot — Route Map

**Status:** Approved for planning · **Date:** 2026-09-14
**Companion docs:** [architecture.md](architecture.md), [domain-model.md](domain-model.md), [implementation-plan.md](implementation-plan.md)

Legend: **SRC** = server component (RSC, loads via service) · **CC** = client component island · **SA** = Server Action · **RH** = Route Handler · **guard** = middleware/route-level auth+tenant+onboarding gate. All `/app`, `/api/ai`, and mutation routes require a session; tenant scoping from `request.jwt.claims` (see architecture §7).

---

## 1. Global middleware (`middleware.ts`)

Runs on eligible routes, resolves session cookie → hydrates a lightweight `TenantContext`; if missing/expired → redirect to `/login` (or pass through for public). Non-blocking: full check happens per-route via `getSessionServer` in server components.

### Guard matrix

| Route group                               | Auth required | Org required | Onboarding required     | Notes                                                                                  |
| ----------------------------------------- | ------------- | ------------ | ----------------------- | -------------------------------------------------------------------------------------- |
| `/` `/(marketing)/*` `/login` `/register` | no            | —            | —                       | public                                                                                 |
| `/invite/[token]`                         | partial       | —            | —                       | token validates in handler; redirects to `/login` if unauthenticated (preserves token) |
| `/app` `/**`                              | **yes**       | **yes**      | yes except `onboarding` | missing org → `/app/onboarding`                                                        |
| `/app/onboarding`                         | yes           | no           | —                       | ramp wizard                                                                            |
| `/app/settings/members`                   | yes           | yes, `admin  | owner` role             | yes                                                                                    | role check in service layer |

---

## 2. Public routes

### 2.1 Marketing (`(marketing)` group)

| Route                           | Kind | Handler notes              |
| ------------------------------- | ---- | -------------------------- |
| `/`                             | SRC  | Landing; CTA → `/register` |
| `/pricing`                      | SRC  | Static; billing deferred   |
| `/legal/privacy` `/legal/terms` | SRC  | Static MD-rendered         |

### 2.2 Auth (`(auth)` group)

| Route             | Kind         | Handler notes                                                                                                       |
| ----------------- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `/login`          | SRC+CC       | Credentials form → Auth.js `signIn`; redirect `?callbackUrl`                                                        |
| `/register`       | SRC+CC       | Create user → create org (owner) → redirect `/app/onboarding`                                                       |
| `/invite/[token]` | SRC+SA or RH | Validates `Invite` (unexpired, unused); if authed → accept + join; else → `/login?invite=…`; errors → friendly page |
| `/reset-password` | SRC+SA       | Phase 1.5: token-based reset (email transport = dev mailer first)                                                   |

---

## 3. Authenticated app shell (`(app)` group)

Shell layout renders sidebar (Dashboard, Actions, Quota, Accounts, Opportunities, Forecast, Prep, Practice, Settings) + org switcher (phase 2). Resolves `TenantContext` once per request via RSC.

### 3.1 Dashboard / ramp

| Route             | Kind                | Notes                                                                                                                                                                                              |
| ----------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/app`            | redirect            | → `/app/dashboard`                                                                                                                                                                                 |
| `/app/dashboard`  | SRC + CC tiles      | Today's action plan (`ActionTask[]`, top 5) · quota progress rail (target vs booked, current period) · forecast snapshot (committed/best-case/pipeline + risk count) · next scheduled meeting card |
| `/app/onboarding` | SRC + multi-step CC | Steps: role+term → org/team → quota setup → (skip) CSV/CRM import → done. Progress stored in `User.onboarded_at` on completion.                                                                    |

### 3.2 Quota

| Route                 | Kind     | Notes                                                                                            |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `/app/quota`          | SRC      | Current QuotaPlan: target, components, period progress bar, breakdown by component; edit (admin) |
| `/app/quota/[planId]` | SRC + CC | Plan detail/history; CRUD via SAs (admin)                                                        |

### 3.3 Accounts

| Route                       | Kind     | Notes                                                                                                     |
| --------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `/app/accounts`             | SRC + CC | List w/ filter (priority tier, region, industry, owner), sort by priority score; row actions              |
| `/app/accounts/new`         | SRC + CC | Form → `CREATE_ACCOUNT` SA (zod-validated) → recompute priority                                           |
| `/app/accounts/[accountId]` | SRC + CC | Detail: profile, tech_stack, opportunities, meetings, next best prep (`GeneratePrep` CTA), notes, actions |

### 3.4 Opportunities

| Route                        | Kind     | Notes                                                                                                                                                    |
| ---------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/app/opportunities`         | SRC + CC | Pipeline table: amount, weighted value, stage, risk score chip, close date; filters/sorts                                                                |
| `/app/opportunities/[oppId]` | SRC + CC | Detail: stage progress, risk signals list (rules), revenue notes (user-entered only — AI never writes financial fields), forecast placement, meeting log |

### 3.5 Forecast

| Route                     | Kind     | Notes                                                                                                                                    |
| ------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/app/forecast`           | SRC      | Current quarter: committed/best-case/pipeline per owner, total vs target, risk count, `RECOMPUTE` action                                 |
| `/app/forecast/[quarter]` | SRC + CC | Drill-down per owner; edit committed/best-case/pipeline (CC form → SA); AI assistant proposes risk flags (suggest-only, §8 architecture) |

### 3.6 Daily actions

| Route                | Kind | Notes                                                                              |
| -------------------- | ---- | ---------------------------------------------------------------------------------- |
| `/app/actions`       | SRC  | All open ActionTasks grouped by day, priority sorted; toggle done/skip inline (SA) |
| `/app/actions/today` | SRC  | Today only; dense checklist UI; regenerate (SA `REFRESH_PLAN`)                     |

### 3.7 Prep (call & demo prep — one of the two MVP AI features)

| Route                            | Kind     | Notes                                                                                 |
| -------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `/app/prep`                      | SRC      | Recent PrepDocuments + "new prep" builder (pick account, kind)                        |
| `/app/prep/new?account=…&kind=…` | CC       | Builder → RH `POST /api/ai/prep` (streaming) → live doc                               |
| `/app/prep/[prepId]`             | SRC + CC | Rendered PrepDocument (structured sections), regenerate (new version), copy/export MD |

### 3.8 Practice (objection handling — the other MVP AI feature)

| Route                       | Kind                | Notes                                                                                  |
| --------------------------- | ------------------- | -------------------------------------------------------------------------------------- |
| `/app/practice`             | SRC + CC            | Scoreboard of past PracticeSessions + start new (pick objection/scenario)              |
| `/app/practice/[sessionId]` | CC (streaming chat) | Chat that role-plays the objection; on end → AI feedback + score, saved; usage metered |
| `/app/objections`           | SRC + CC            | Org playbook CRUD (severity, talk_track, notes)                                        |

### 3.9 Settings

| Route                        | Kind     | Role            | Notes                                                                       |
| ---------------------------- | -------- | --------------- | --------------------------------------------------------------------------- |
| `/app/settings`              | SRC      | member          | Profile (name, tz, locale), password change                                 |
| `/app/settings/members`      | SRC + CC | **admin/owner** | Membership list, invite form (SA → creates Invite), role change, deactivate |
| `/app/settings/integrations` | SRC      | admin/owner     | **Stage 2 placeholder**: CRM connector status (empty state)                 |
| `/app/settings/billing`      | SRC      | owner           | **Stage 2 placeholder**                                                     |

---

## 4. API Route Handlers (`/api/*`)

All require a session; all validate with zod; all delegate to services with `TenantContext`. Streaming responses use SSE/incremental chunks.

| Endpoint                  | Method | Guards                      | Purpose → Service                                                                                 | Streaming                                         |
| ------------------------- | ------ | --------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `/api/session`            | GET    | session                     | Return non-sensitive session projection (org id, role, onboarding state) for client bootstrapping | —                                                 |
| `/api/ai/prep`            | POST   | session + org + feature cap | `GeneratePrep(doc: {accountId, kind, focus?})` via `AiService` → `PrepDocument`                   | yes                                               |
| `/api/ai/practice`        | POST   | session + org + cap         | `PracticeTurn(message)` — role-play turn, usage logged                                            | yes                                               |
| `/api/ai/practice/end`    | POST   | session + org               | `ScorePractice(sessionId)` → writes score jsonb                                                   | yes                                               |
| `/api/ai/plan`            | POST   | session + org               | `RefreshActionPlan(userId)` → regenerate today's tasks                                            | —                                                 |
| `/api/import/csv`         | POST   | session + org, admin        | `ImportCsv({type: accounts                                                                        | opportunities, rows[]})` → dry-run result + apply | no (but large sets → chunked status) |
| `/api/invites`            | POST   | session + org, admin        | `CreateInvite(email, role)`                                                                       | —                                                 |
| `/api/forecast/recompute` | POST   | session + org               | `RecomputeForecast(quarter)` → recompute weighted + risk signals                                  | —                                                 |
| `/api/integrations/*`     | —      | —                           | **Deferred to Phase 6** (webhooks for CRM sync)                                                   | —                                                 |

**Error contract:** consistent envelope `{ ok:false, error:{ code, message, details? } }`; codes enumerated (`VALIDATION`, `FORBIDDEN`, `NOT_FOUND`, `TENANT_VIOLATION`, `AI_QUOTA`, `RATE_LIMITED`). Financial fields never echo model output.

---

## 5. Server Action registry (page-local mutations)

| Action                                                       | Target           | Service                                                                     | Notes                                     |
| ------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------- | ----------------------------------------- |
| `CREATE_ACCOUNT` / `UPDATE_ACCOUNT` / `DELETE_ACCOUNT`       | account forms    | Accounts service + priority recompute                                       | soft delete                               |
| `CREATE_OPPORTUNITY` / `UPDATE_OPPORTUNITY` / `STAGE_CHANGE` | opp forms        | Opportunities service; stage transition validation; recompute weighted/risk |                                           |
| `SET_FORECAST_VALUES`                                        | forecast form    | Forecast service                                                            | committed≤best≤pipeline invariant         |
| `TOGGLE_TASK` / `SKIP_TASK` / `REFRESH_PLAN`                 | actions page     | Plan service                                                                |                                           |
| `SAVE_PREP_NOTES` / `REGENERATE_PREP`                        | prep doc         | Prep service (regenerate → AiService)                                       |                                           |
| `SAVE_OBJECTION` / `SET_OBJECTION_SEVERITY`                  | objections       | Objection service                                                           |                                           |
| `UPDATE_PLAN` (quota, admin)                                 | quota plan       | Quota service                                                               |                                           |
| `UPDATE_MEMBER_ROLE` / `DEACTIVATE_MEMBER`                   | settings/members | Membership service                                                          | owner can't demote self out of last owner |
| `ACCEPT_INVITE`                                              | invite route     | Membership service                                                          | single-use token                          |

All SAs: zod input schema, `authorize(ctx, ability)` check, revalidate affected path tags.

---

## 6. Revalidation tags (RSC caching strategy)

Route tags let we update derived data without client-managed state:

- `quota:{orgId}` · `accounts:{orgId}` · `opportunities:{orgId}` · `forecast:{orgId}:{quarter}` · `actions:{orgId}:{userId}:{date}` · `prep:{orgId}:{prepId}` · `practice:{orgId}`

Server Actions and Route Handlers call `revalidateTag` for the tags their write affects (e.g. `STAGE_CHANGE` → `opportunities` + `forecast` + `actions`).

---

## 7. Onboarding funnel (route behavior)

```
/register → org(owner) → /app/onboarding  ──wizard──►  complete
   │                                          ▲ (skip)   │
   │  User has org but !onboarded_at          │          ▼
   └──────────────────────────────────────────┘   /app/dashboard (all tags warm)
```

- `!onboarded_at` user hitting any `/app/*` (except onboarding) → redirect `/app/onboarding`.
- Wizard step state kept server-side per user (no fragile client localStorage); "skip" marks `onboarded_at` and surfaces a slim empty state.

---

## 8. Route → file map (scaffolding reference)

```
src/app/
  layout.tsx
  (marketing)/page.tsx  (marketing)/pricing/page.tsx  (marketing)/legal/{privacy,terms}/page.tsx
  (auth)/login/page.tsx  (auth)/register/page.tsx
  (auth)/invite/[token]/page.tsx
  api/session/route.ts  api/ai/prep/route.ts  api/ai/practice/route.ts
  api/ai/practice/end/route.ts  api/ai/plan/route.ts
  api/import/csv/route.ts  api/invites/route.ts  api/forecast/recompute/route.ts
  (app)/layout.tsx  (app)/dashboard/page.tsx  (app)/onboarding/page.tsx
  (app)/quota/page.tsx  (app)/quota/[planId]/page.tsx
  (app)/accounts/page.tsx  (app)/accounts/new/page.tsx  (app)/accounts/[accountId]/page.tsx
  (app)/opportunities/page.tsx  (app)/opportunities/[oppId]/page.tsx
  (app)/forecast/page.tsx  (app)/forecast/[quarter]/page.tsx
  (app)/actions/page.tsx  (app)/actions/today/page.tsx
  (app)/prep/page.tsx  (app)/prep/new/page.tsx  (app)/prep/[prepId]/page.tsx
  (app)/practice/page.tsx  (app)/practice/[sessionId]/page.tsx
  (app)/objections/page.tsx
  (app)/settings/page.tsx  (app)/settings/members/page.tsx
  (app)/settings/integrations/page.tsx  (app)/settings/billing/page.tsx
```
