/**
 * Onboarding / first-quarter flight plan (domain-model §1.5 QuotaPlan).
 * Scaffold projection — final fields sourced from `packages/contracts` when
 * the quota contracts ship (Phase 2).
 */
export interface RampPhase {
  /** Stable id, e.g. `day_0_30`. */
  id: string;
  label: string;
  goal: string;
}
