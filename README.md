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

## Layout

- `apps/web` — the Next.js application. `src/app` is routing only; business logic
  lives in `src/features/**` (DTOs, schemas, services, repositories, Server Actions).
- `packages/contracts` — zod schemas, single source of truth for validation.
- `packages/domain` — pure rule modules (prioritization, quota funnel, opportunity
  health, risk, scheduling).
- `packages/prompts` — versioned, typed AI prompt templates.
