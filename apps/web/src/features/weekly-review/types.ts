/** domain-model §4. */
export type RiskCategory =
  'financial' | 'timing' | 'technical' | 'competition' | 'champion' | 'data';
export type RiskSeverity = 'critical' | 'warning' | 'info';

/** Detected risk flag — rule or AI (domain-model §1.13). */
export interface RiskSignalSummary {
  id: string;
  category: RiskCategory;
  severity: RiskSeverity;
  message: string;
  source: 'rules' | 'ai';
}

/** Quarterly forecast line projection (domain-model §1.12). */
export interface ForecastQuarter {
  quarter: string;
  committedMinor: number;
  bestCaseMinor: number;
  pipelineMinor: number;
}
