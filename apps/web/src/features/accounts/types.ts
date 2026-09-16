/** cuid2 id, prefix `acc_` (domain-model §1.6). */
export type AccountId = string;

/** domain-model §4 — rule-computed, not user-entered. */
export type PriorityTier = 'p1' | 'p2' | 'p3' | 'none';

/** List/detail projection of an Account (domain-model §1.6). */
export interface AccountSummary {
  id: AccountId;
  name: string;
  region: string | null;
  industry: string | null;
  priorityTier: PriorityTier;
}
