# CLAUDE.md

Guidance for Claude Code (and human contributors) working in the QuotaPilot repository. **This is the current, authoritative architecture reference** — read it before writing code.

> Living architecture: [architecture.md](architecture.md) · [domain-model.md](domain-model.md) · [route-map.md](route-map.md) · [implementation-plan.md](implementation-plan.md)
> Decided 2026-09-14. Key choices: **Next.js full-stack · Supabase+Postgres RLS · Auth.js v5 · multi-provider AI (Vercel AI SDK)**.

---

## 1. What we're building

A multi-tenant SaaS (QuotaPilot) for technical sellers: ramp-up, quota understanding, account/opportunity prioritization, call & demo prep, objection practice, forecast risk flags, and a daily action plan. Data-driven operating layer + AI copilots.

## 2. Environment & commands

- **OS:** Windows (PowerShell default; Bash available). Use `npm`/`pnpm` scripts — no bash-only steps in dev/test.
- **Package manager:** pnpm workspaces: `apps/web` · `packages/contracts` · `packages/prompts` · `packages/domain`.
- **Default commands** (as they exist once scaffolded):
  - `pnpm dev` (web) · `pnpm test` (Vitest) · `pnpm lint` / `pnpm typecheck` · `pnpm build`
  - `pnpm prisma migrate dev` (local) — migration is **owner-role only**, never from app code.
  - `pnpm db:seed` — demo org with realistic accounts/opps/objections.

## 3. Architecture rules (mandatory)

1. **Layering** (see architecture §6): route → service → rule modules → repository → Postgres. Services never import DB or UI internals; repositories are the only DB access. Enforce via `server-only` imports + `import/no-restricted-paths` in ESLint.
2. **Tenancy — never optional:**
   - Every tenant-scoped table carries `organization_id`; the repository receives a `TenantContext` and injects the org filter into **every** query. No tenant-scoped-lookup-without-org method. Ever.
   - Tenancy is **defense-in-depth**: app-layer scoping (primary) + Postgres **RLS** backstop reading `request.jwt.claims` (set per request). The app runtime connects as a non-superuser **app role** subject to RLS; `postgres`/service-role is for migrations/system ops only.
   - **The client never supplies the org id.** Org comes from the session (`TenantContext`).
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
- Prisma→RLS session-claim spike decision (Phase 1) should be recorded back into architecture §7.2 before Phase 2.
- When in doubt, ask: "does this read/write stay inside the org from the session?" If yes-and-clear, proceed; else ask the architect.

## 8. Attribution

End git commit messages with:

```
Co-Authored-By: Claude Code <noreply@anthropic.com>
```

End PR descriptions with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
