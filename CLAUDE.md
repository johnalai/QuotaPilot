# CLAUDE.md

Guidance for Claude Code (and human contributors) in the QuotaPilot repository. **Read before writing code.**

> **Current state:** [STATUS.md](STATUS.md) records what is _verified working_, what is _genuinely absent_, and the next three steps — each with the command or artefact that proves it. Read it before proposing work, and update it when your work changes it. `implementation-plan.md` describes intent; STATUS.md describes reality.

> Detail lives in the living docs, not here: [architecture.md](architecture.md) (§6 layering, §7.2 RLS claims, §9.2 role matrix) · [domain-model.md](domain-model.md) · [route-map.md](route-map.md) · [implementation-plan.md](implementation-plan.md)
> Stack decided 2026-09-14: **Next.js full-stack · Supabase+Postgres RLS · Auth.js v5 · multi-provider AI (Vercel AI SDK)**.

## 1. What we're building

Multi-tenant SaaS (QuotaPilot) for technical sellers: ramp-up, quota understanding, account/opportunity prioritization, call & demo prep, objection practice, forecast risk flags, daily action plan. Data-driven operating layer + AI copilots.

## 2. Environment & commands

- **OS:** Windows (PowerShell default; Bash available). Use `npm`/`pnpm` scripts — no bash-only steps in dev/test.
- **Package manager:** pnpm workspaces: `apps/web` · `packages/contracts` · `packages/prompts` · `packages/domain`.
- **Default commands** (as they exist once scaffolded): `pnpm dev` · `pnpm test` (Vitest) · `pnpm lint` / `pnpm typecheck` · `pnpm build` · `pnpm prisma migrate dev` (local — migration is **owner-role only**, never from app code) · `pnpm db:seed`.
- **Local services:** `scripts/dev-up.ps1` brings up Docker/Postgres, then the **omniroute** model gateway on `127.0.0.1:20128` (~2 min to become ready — Claude Code fails with `ECONNREFUSED` if it starts first), then `pnpm dev`. Postgres is published on loopback only. The live RLS gate is `pnpm --filter @quotapilot/web test:isolation`, which needs that Postgres.

## 3. Architecture rules (mandatory)

1. **Layering:** route → service → rule modules → repository → Postgres. Services never import DB or UI internals; repositories are the only DB access. Enforced via `server-only` imports + `import/no-restricted-paths` in ESLint.
2. **Tenancy — never optional:**
   - Every tenant-scoped table carries `organization_id`; the repository receives a `TenantContext` and injects the org filter into **every** query. No tenant-scoped-lookup-without-org method. Ever.
   - Tenancy is **defense-in-depth**: app-layer scoping (primary) + Postgres **RLS** backstop reading `request.jwt.claims`. The app runtime connects as a non-superuser **app role** subject to RLS; `postgres`/service-role is for migrations/system ops only.
   - **RLS claims are transaction-scoped, never session-scoped.** Per HTTP request, set `select set_config('request.jwt.claims', '<json claim>', true)` (≈ `SET LOCAL`) inside the same Prisma interactive transaction that performs the tenant-scoped queries, and run those queries only through the **transaction-bound** Prisma client — never the root client, never `set_config(..., false)`. Session-scoped claims leak across pooled connections. (Evidence: architecture §7.2, docs/phase-1-slice-1.md.)
   - **The client never supplies the org id** — org comes from the session (`TenantContext`).
3. **Financial integrity:** money = integer minor units + ISO currency; weighted values and risk scores are **computed**, never user-entered; **AI output never writes financial fields** — AI proposes, the user commits.
4. **Validation:** zod schemas in `packages/contracts` are the single source of truth used by forms, Server Actions, and Route Handlers.
5. **AI:** all model calls through `AiService` + provider registry; prompts are versioned, typed data in `packages/prompts` with input/output schemas and golden tests. Provider keys server-only. Usage always written to `AiUsage`; per-org caps enforced.
6. **Server components by default:** use `"use client"` only for genuinely interactive islands. Streaming AI = Route Handler; UI mutations = Server Action.

## 4. Authorization model

- Sessions: Auth.js v5, database sessions, httpOnly + SameSite=Lax cookies.
- Roles: `owner │ admin │ member` (on `Membership`). Authorization enforced in the **service layer** via `authorize(ctx, ability)` — never blocked/trusted in the UI.
- Role matrix (architecture §9.2): members edit data + run AI; admin adds members/settings; owner manages roles + org.
- Invites: single-use, expiry ~7 days, hashed at rest.

## 5. Testing conventions

- Unit (Vitest): pure rule modules (`packages/domain/rules/*`), zod schemas, AI prompt golden tests with a **mocked provider**.
- Integration: repository + **RLS isolation suite** against a real Postgres. **A PR touching any tenant-scoped table MUST include a cross-tenant isolation test — this is the release gate.**
- API: supertest against Route Handlers (validation + error envelope).
- E2E: Playwright — auth → onboarding → CRUD → dashboard → prep smoke.
- Error contract: `{ ok:false, error:{ code, message, details? } }` with fixed codes (`VALIDATION/FORBIDDEN/NOT_FOUND/TENANT_VIOLATION/AI_QUOTA/RATE_LIMITED`).

## 6. What NOT to do

- Do not create DB schema/migrations or scaffold app features until the implementation plan is approved (wait for explicit green light).
- No raw SQL outside the repository layer (reviewed migrations excepted).
- No client-side secrets; no `NEXT_PUBLIC_*` for keys.
- No direct SQL/DB access from client components; no provider calls from the client.
- No float money; no mutating rule-derived fields by hand.
- Do not commit `.env`; `.env.example` is the template.
- No third-party auth-managed bids; Auth.js is the chosen path (revisit only with explicit direction).
- E2E/interactive git flags (`git add -i`, `git rebase -i`) are unsupported in this environment.

## 7. Working here

- Small green steps, Phase 1 isolation gate before feature work (see implementation-plan).
- When in doubt, ask: "does this read/write stay inside the org from the session?" If yes-and-clear, proceed; else ask the architect.

## 8. Attribution

- End git commit messages with `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
- End PR descriptions with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
