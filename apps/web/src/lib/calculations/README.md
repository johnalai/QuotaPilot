# lib/calculations — adapters over packages/domain rules

Thin app-facing wrappers for the pure rule modules in `packages/domain` (money
formatting, weighted opportunity, priority/risk scoring, plan scheduling).
Keeps the domain rules framework-free and unit-testable.

Lands as the matching rule module ships: Phase 2 (quota, weighting), Phase 3
(risk, planning). Until then the UI reads money helpers directly from
`@quotapilot/domain`. Intentionally not scaffolded empty.
