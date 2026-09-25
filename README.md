# QuotaPilot

A multi-tenant SaaS that helps technical sellers know **what to do today, why it
matters, and how it affects the probability of reaching quota.**

- Architecture: [architecture.md](architecture.md) · [domain-model.md](domain-model.md)
- Routes: [route-map.md](route-map.md) · Plan: [implementation-plan.md](implementation-plan.md)
- Working here: see [CLAUDE.md](CLAUDE.md)

## Stack

Next.js (App Router) · TypeScript (strict) · React Server Components · Tailwind CSS ·
shadcn/ui · PostgreSQL · Prisma · Zod · Auth.js v5 · Vitest · Playwright · Docker Compose

## Commands

```bash
pnpm install            # install the workspace
pnpm db:up              # start local Postgres (Docker Compose)
pnpm dev                # run the web app (http://localhost:3000)
pnpm test               # Vitest (rule modules, schemas)
pnpm typecheck          # tsc --noEmit across the workspace
pnpm lint               # ESLint
pnpm build              # production build
```

## Local development

Order matters. The model gateway needs roughly **two minutes** to become ready,
and Claude Code fails with `ECONNREFUSED` if it is started first.

1. **Postgres** — `pnpm db:up`. Published on loopback only (`127.0.0.1:5432`).
2. **Model gateway** — `omniroute serve`, listening on `http://127.0.0.1:20128`
   (loopback only). Ready when `/api/monitoring/health` returns
   `{"status":"healthy"}`.
3. **App** — `pnpm dev` → <http://localhost:3000>.

`scripts/dev-up.ps1` runs all three in order, waiting for each to actually report
healthy before moving on:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev-up.ps1          # deps, then the dev server
powershell -ExecutionPolicy Bypass -File .\scripts\dev-up.ps1 -NoDev   # dependencies only
```

### Two database roles

- `quotapilot` — owner / migration role (superuser locally). Used by migrations,
  seeds, and the isolation suite's fixtures.
- `quotapilot_app` — the runtime role: non-owner, **NOBYPASSRLS**, subject to row
  level security. The app connects as this role, and every isolation assertion runs
  as this role.

Credentials live in `.env.local` (runtime) and `.env.migration` (owner); both files
are gitignored. Background: [docs/phase-1-slice-2.md](docs/phase-1-slice-2.md).

### Tests

`pnpm test` covers the unit surfaces only. The live-database release gate is
separate because it needs a real Postgres:

```bash
pnpm --filter @quotapilot/web test:isolation
```

It is deliberately excluded from `pnpm test`; CI runs it as its own job against a
throwaway Postgres container.

## Layout

- `apps/web` — the Next.js application. `src/app` is routing only; business logic
  lives in `src/features/**` (DTOs, schemas, services, repositories, Server Actions).
- `packages/contracts` — zod schemas, single source of truth for validation.
- `packages/domain` — pure rule modules (prioritization, quota funnel, opportunity
  health, risk, scheduling).
- `packages/prompts` — versioned, typed AI prompt templates.
