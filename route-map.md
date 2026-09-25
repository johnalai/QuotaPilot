# QuotaPilot — Route Map

**Status:** Approved for planning · **Plan date:** 2026-09-14 · **Paths reconciled to implementation:** 2026-09-24
**Companion docs:** [architecture.md](architecture.md), [domain-model.md](domain-model.md), [implementation-plan.md](implementation-plan.md)

Legend: **SRC** = server component (RSC, loads via service) · **CC** = client component island · **SA** = Server Action · **RH** = Route Handler · **guard** = middleware/route-level auth+tenant+onboarding gate. All authenticated routes and mutation routes require a session; tenant scoping comes from `request.jwt.claims` (see architecture §7).

---

## 0. Implementation divergence (read this first)

The original plan below used an `(app)` route group and an `/app/*` URL prefix. The
implementation uses a **`(dashboard)`** group and **unprefixed URLs** (`/dashboard`, not
`/app/dashboard`). Paths in this document have been rewritten to match the code.

If the `/app/*` prefix is still wanted, it is a route-segment change (`(dashboard)/app/…`)
plus a sweep of every internal link — not a rename of the group.

**Built so far** (Phase 1 + Phase 2a):

| Area            | Routes                                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public          | `/`                                                                                                                                                                                           |
| Auth            | `/login` · `/register`                                                                                                                                                                        |
| Dashboard group | `/dashboard` · `/accounts` · `/accounts/[accountId]` · `/actions` · `/call-coach` · `/forecast` · `/opportunities` · `/opportunities/[opportunityId]` · `/quota` · `/ramp` · `/weekly-review` |
| API             | `/api/auth/[...nextauth]` · `/api/session` · `/api/health` · `/api/forecast/overrides/[id]` (DELETE) · `/api/forecast/values` (PATCH) · `/api/forecast/recompute` (POST)                      |

**Planned, not yet built** — the tables below describe the target state; the following are
still outstanding: `/invite/[token]` · `/reset-password` · `/pricing` · `/legal/{privacy,terms}` ·
`/accounts/new` · `/actions/today` (sections 3.3, 3.6) · all of `/prep*` · `/practice*` ·
`/objections` · all of `/settings*` · `/api/ai/*` · `/api/import/csv` · `/api/invites`.

Two implemented routes are **not in the original plan** and are additive:
`/call-coach` · `/weekly-review` · `/ramp` (which fulfils the planned `/onboarding` wizard slot).

---

## 1. Global middleware (`middleware.ts`)

Runs on eligible routes, resolves session cookie → hydrates a lightweight `TenantContext`; if missing/expired → redirect to `/login` (or pass through for public). Non-blocking: full check happens per-route via `getSessionServer` in server components.

### Guard matrix

| Route group                               | Auth required | Org required | Onboarding required | Notes                                                                                  |
| ----------------------------------------- | ------------- | ------------ | ------------------- | -------------------------------------------------------------------------------------- |
| `/` `/(marketing)/*` `/login` `/register` | no            | —            | —                   | public                                                                                 |
| `/invite/[token]`                         | partial       | —            | —                   | token validates in handler; redirects to `/login` if unauthenticated (preserves token) |
| `/(dashboard)/**`                         | **yes**       | **yes**      | yes except `ramp`   | missing org → `/ramp`                                                                  |
| `/ramp`                                   | yes           | no           | —                   | ramp wizard (planned as `/onboarding`)                                                 |
| `/settings/members`                       | yes           | yes, `admin  | owner` role         | yes                                                                                    | role check in service layer |

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
| `/register`       | SRC+CC       | Create user → create org (owner) → redirect `/ramp`                                                                 |
| `/invite/[token]` | SRC+SA or RH | Validates `Invite` (unexpired, unused); if authed → accept + join; else → `/login?invite=…`; errors → friendly page |
| `/reset-password` | SRC+SA       | Phase 1.5: token-based reset (email transport = dev mailer first)                                                   |

---

## 3. Authenticated app shell (`(dashboard)` group)

Shell layout renders sidebar (Dashboard, Actions, Quota, Accounts, Opportunities, Forecast, Prep, Practice, Settings) + org switcher (phase 2). Resolves `TenantContext` once per request via RSC.

### 3.1 Dashboard / ramp

| Route        | Kind                | Notes                                                                                                                                                                                              |
| ------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard` | SRC + CC tiles      | Today's action plan (`ActionTask[]`, top 5) · quota progress rail (target vs booked, current period) · forecast snapshot (committed/best-case/pipeline + risk count) · next scheduled meeting card |
| `/ramp`      | SRC + multi-step CC | Ramp wizard. Steps: role+term → org/team → quota setup → (skip) CSV/CRM import → done. Progress stored in `User.onboarded_at` on completion.                                                       |

### 3.2 Quota

| Route             | Kind     | Notes                                                                                            |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `/quota`          | SRC      | Current QuotaPlan: target, components, period progress bar, breakdown by component; edit (admin) |
| `/quota/[planId]` | SRC + CC | Plan detail/history; CRUD via SAs (admin)                                                        |

### 3.3 Accounts

| Route                   | Kind     | Notes                                                                                                     |
| ----------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `/accounts`             | SRC + CC | List w/ filter (priority tier, region, industry, owner), sort by priority score; row actions              |
| `/accounts/new`         | SRC + CC | Form → `CREATE_ACCOUNT` SA (zod-validated) → recompute priority                                           |
| `/accounts/[accountId]` | SRC + CC | Detail: profile, tech_stack, opportunities, meetings, next best prep (`GeneratePrep` CTA), notes, actions |

### 3.4 Opportunities

| Route                            | Kind     | Notes                                                                                                                                                    |
| -------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/opportunities`                 | SRC + CC | Pipeline table: amount, weighted value, stage, risk score chip, close date; filters/sorts                                                                |
| `/opportunities/[opportunityId]` | SRC + CC | Detail: stage progress, risk signals list (rules), revenue notes (user-entered only — AI never writes financial fields), forecast placement, meeting log |

### 3.5 Forecast

| Route                 | Kind     | Notes                                                                                                                                                                                                                                    |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/forecast`           | SRC      | Current quarter: totals, per-month computed vs override, links to each quarter, `RECOMPUTE` action. Reads through the forecast service; editing lives on the drill-down. **Outstanding: per-owner breakdown, quota target, risk count.** |
| `/forecast/[quarter]` | SRC + CC | Drill-down per owner; edit committed/best-case/pipeline (CC form → SA); AI assistant proposes risk flags (suggest-only, §8 architecture)                                                                                                 |

### 3.6 Daily actions

| Route            | Kind | Notes                                                                              |
| ---------------- | ---- | ---------------------------------------------------------------------------------- |
| `/actions`       | SRC  | All open ActionTasks grouped by day, priority sorted; toggle done/skip inline (SA) |
| `/actions/today` | SRC  | Today only; dense checklist UI; regenerate (SA `REFRESH_PLAN`)                     |

### 3.7 Prep (call & demo prep — one of the two MVP AI features)

| Route                        | Kind     | Notes                                                                                 |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `/prep`                      | SRC      | Recent PrepDocuments + "new prep" builder (pick account, kind)                        |
| `/prep/new?account=…&kind=…` | CC       | Builder → RH `POST /api/ai/prep` (streaming) → live doc                               |
| `/prep/[prepId]`             | SRC + CC | Rendered PrepDocument (structured sections), regenerate (new version), copy/export MD |

### 3.8 Practice (objection handling — the other MVP AI feature)

| Route                   | Kind                | Notes                                                                                  |
| ----------------------- | ------------------- | -------------------------------------------------------------------------------------- |
| `/practice`             | SRC + CC            | Scoreboard of past PracticeSessions + start new (pick objection/scenario)              |
| `/practice/[sessionId]` | CC (streaming chat) | Chat that role-plays the objection; on end → AI feedback + score, saved; usage metered |
| `/objections`           | SRC + CC            | Org playbook CRUD (severity, talk_track, notes)                                        |

### 3.9 Settings

| Route                    | Kind     | Role            | Notes                                                                       |
| ------------------------ | -------- | --------------- | --------------------------------------------------------------------------- |
| `/settings`              | SRC      | member          | Profile (name, tz, locale), password change                                 |
| `/settings/members`      | SRC + CC | **admin/owner** | Membership list, invite form (SA → creates Invite), role change, deactivate |
| `/settings/integrations` | SRC      | admin/owner     | **Stage 2 placeholder**: CRM connector status (empty state)                 |
| `/settings/billing`      | SRC      | owner           | **Stage 2 placeholder**                                                     |

### 3.10 Additional implemented routes (not in the original plan)

| Route            | Kind     | Notes                                       |
| ---------------- | -------- | ------------------------------------------- |
| `/call-coach`    | SRC + CC | Call coaching surface (Phase 2a)            |
| `/weekly-review` | SRC + CC | Weekly review with risk snapshot (Phase 2a) |

---

## 4. API Route Handlers (`/api/*`)

All require a session; all validate with zod; all delegate to services with `TenantContext`. Streaming responses use SSE/incremental chunks.

### 4.1 Implemented

| Endpoint                       | Method | Guards        | Purpose → Service                                                                |
| ------------------------------ | ------ | ------------- | -------------------------------------------------------------------------------- |
| `/api/auth/[...nextauth]`      | *      | —             | Auth.js handler (sign-in/out, session)                                           |
| `/api/session`                 | GET    | session       | Non-sensitive session projection (org id, onboarding state) for client bootstrap |
| `/api/health`                  | GET    | —             | Liveness probe                                                                   |
| `/api/forecast/overrides/[id]` | DELETE | session + org | Delete one override (the drill-down's Clear action)                              |
| `/api/forecast/values`         | PATCH  | session + org | Upsert override; enforces `committed ≤ bestCase ≤ pipeline` (minor units)        |
| `/api/forecast/recompute`      | POST   | session + org | `RecomputeForecast(quarter)` → recompute weighted + risk signals                 |

### 4.2 Planned

| Endpoint               | Method | Guards                      | Purpose → Service                                                               | Streaming                            |
| ---------------------- | ------ | --------------------------- | ------------------------------------------------------------------------------- | ------------------------------------ |
| `/api/ai/prep`         | POST   | session + org + feature cap | `GeneratePrep(doc: {accountId, kind, focus?})` via `AiService` → `PrepDocument` | yes                                  |
| `/api/ai/practice`     | POST   | session + org + cap         | `PracticeTurn(message)` — role-play turn, usage logged                          | yes                                  |
| `/api/ai/practice/end` | POST   | session + org               | `ScorePractice(sessionId)` → writes score jsonb                                 | yes                                  |
| `/api/ai/plan`         | POST   | session + org               | `RefreshActionPlan(userId)` → regenerate today's tasks                          | —                                    |
| `/api/import/csv`      | POST   | session + org, admin        | `ImportCsv({type: accounts \| opportunities, rows[]})` → dry-run result + apply | no (but large sets → chunked status) |
| `/api/invites`         | POST   | session + org, admin        | `CreateInvite(email, role)`                                                     | —                                    |
| `/api/integrations/*`  | —      | —                           | **Deferred to Phase 6** (webhooks for CRM sync)                                 | —                                    |

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

Auth's own mutations live beside their routes rather than in the registry above:
`app/(auth)/login/actions.ts` (sign-in) and `app/(dashboard)/actions.ts` (sign-out,
rendered as a plain form in the shell sidebar — no client JS).

**Abilities are the vocabulary in `lib/permissions/abilities.ts`:** `view` · `mutate` ·
`manage_members` · `manage_settings` · `manage_org`. `authorize(ctx, ability)` returns a
**boolean** and requires `ctx.role` — never destructure it.

---

## 6. Revalidation tags (RSC caching strategy)

Route tags let we update derived data without client-managed state:

- `quota:{orgId}` · `accounts:{orgId}` · `opportunities:{orgId}` · `forecast:{orgId}:{quarter}` · `actions:{orgId}:{userId}:{date}` · `prep:{orgId}:{prepId}` · `practice:{orgId}`

Server Actions and Route Handlers call `revalidateTag` for the tags their write affects (e.g. `STAGE_CHANGE` → `opportunities` + `forecast` + `actions`).

---

## 7. Onboarding funnel (route behavior)

```
/register → org(owner) → /ramp  ──wizard──►  complete
   │                              ▲ (skip)   │
   │  User has org but !onboarded_at          │
   └─────────────────────────────────────────┘   /dashboard (all tags warm)
```

- `!onboarded_at` user hitting any `/(dashboard)/*` (except `ramp`) → redirect `/ramp`.
- Wizard step state kept server-side per user (no fragile client localStorage); "skip" marks `onboarded_at` and surfaces a slim empty state.

---

## 8. Route → file map (as implemented)

```
src/app/
  layout.tsx
  (marketing)/page.tsx
  (auth)/login/page.tsx  (auth)/register/page.tsx
  (auth)/login/actions.ts  (auth)/register/actions.ts
  (dashboard)/layout.tsx
  (dashboard)/dashboard/page.tsx
  (dashboard)/accounts/page.tsx  (dashboard)/accounts/[accountId]/page.tsx
  (dashboard)/actions/page.tsx
  (dashboard)/call-coach/page.tsx
  (dashboard)/forecast/page.tsx  (dashboard)/forecast/recompute-button.tsx
  (dashboard)/forecast/[quarter]/page.tsx  (dashboard)/forecast/[quarter]/forecast-quarter-form.tsx
  (dashboard)/opportunities/page.tsx  (dashboard)/opportunities/[opportunityId]/page.tsx
  (dashboard)/quota/page.tsx
  (dashboard)/ramp/page.tsx
  (dashboard)/weekly-review/page.tsx
  api/auth/[...nextauth]/route.ts  api/session/route.ts  api/health/route.ts
  api/forecast/values/route.ts  api/forecast/recompute/route.ts
  api/forecast/overrides/[id]/route.ts
```

**Planned files (not yet created):**

```
  (marketing)/pricing/page.tsx  (marketing)/legal/{privacy,terms}/page.tsx
  (auth)/invite/[token]/page.tsx  (auth)/reset-password/page.tsx
  (dashboard)/accounts/new/page.tsx
  (dashboard)/actions/today/page.tsx
  (dashboard)/prep/page.tsx  (dashboard)/prep/new/page.tsx  (dashboard)/prep/[prepId]/page.tsx
  (dashboard)/practice/page.tsx  (dashboard)/practice/[sessionId]/page.tsx
  (dashboard)/objections/page.tsx
  (dashboard)/settings/page.tsx  (dashboard)/settings/members/page.tsx
  (dashboard)/settings/integrations/page.tsx  (dashboard)/settings/billing/page.tsx
  api/ai/prep/route.ts  api/ai/practice/route.ts  api/ai/practice/end/route.ts  api/ai/plan/route.ts
  api/import/csv/route.ts  api/invites/route.ts
```
