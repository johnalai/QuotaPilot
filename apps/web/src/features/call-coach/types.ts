/** domain-model §4. */
export type PrepKind = 'discovery_guide' | 'demo_plan' | 'objection_script' | 'followup_email';

/** AI-generated prep artifact, list projection (domain-model §1.9). */
export interface PrepDocumentSummary {
  id: string;
  accountName: string;
  kind: PrepKind;
  version: number;
  updatedAt: string;
}

/** Objection-practice run, list projection (domain-model §1.11). */
export interface PracticeSessionSummary {
  id: string;
  scenario: string;
  /** AI feedback rating, null until scored. */
  rating: number | null;
  createdAt: string;
}
