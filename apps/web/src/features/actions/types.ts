/** domain-model §4. */
export type TaskKind = 'call' | 'demo' | 'prep' | 'review' | 'outreach';
export type TaskStatus = 'open' | 'done' | 'skipped';

/** One item on the daily action plan (domain-model §1.14). */
export interface ActionTask {
  id: string;
  kind: TaskKind;
  title: string;
  /** ISO date (YYYY-MM-DD); `today` defaults to the current date. */
  dueDate: string;
  status: TaskStatus;
  /** Sort key from `planScheduler` — lower first. */
  priority: number;
}
