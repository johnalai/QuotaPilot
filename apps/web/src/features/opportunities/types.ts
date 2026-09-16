/** cuid2 id, prefix `opp_` (domain-model §1.7). */
export type OpportunityId = string;

/** domain-model §4 — validated transition map lives in `rules/forecast.ts`. */
export type OpportunityStage =
  'discovery' | 'qualification' | 'technical_eval' | 'negotiation' | 'won' | 'lost' | 'archived';

/** Pipeline row projection (domain-model §1.7). */
export interface OpportunitySummary {
  id: OpportunityId;
  name: string;
  accountName: string;
  amountMinor: number;
  stage: OpportunityStage;
  /** Computed 0–100 by `DetectRisk`; never user-entered. */
  riskScore: number | null;
  /** ISO date of close, null until set. */
  closeDate: string | null;
}
