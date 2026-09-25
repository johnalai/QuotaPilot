/**
 * Pure quarter/date helpers shared by the forecast pages and service.
 *
 * Deliberately free of `server-only` and of any DB import so both a Server
 * Component and the service can use them without dragging in Prisma.
 */

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const QUARTER_PATTERN = /^(\d{4})-Q([1-4])$/;

/** `2026-09` → `2026-Q3`. Returns null when the month is malformed. */
export function quarterOf(month: string): string | null {
  const match = MONTH_PATTERN.exec(month);
  if (!match) return null;

  const [, year, mm] = match;
  const quarter = Math.floor((Number(mm) - 1) / 3) + 1;
  return `${year}-Q${quarter}`;
}

/** `2026-Q3` → `['2026-07', '2026-08', '2026-09']`. Null when malformed. */
export function monthsOfQuarter(quarter: string): string[] | null {
  const match = QUARTER_PATTERN.exec(quarter);
  if (!match) return null;

  const [, year, q] = match;
  const firstMonth = (Number(q) - 1) * 3 + 1;

  return [0, 1, 2].map((offset) => `${year}-${String(firstMonth + offset).padStart(2, '0')}`);
}

/** The `YYYY-Qn` quarter containing `now` (UTC). */
export function currentQuarter(now: Date): string {
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${now.getUTCFullYear()}-Q${quarter}`;
}

/** `2026-09` → `September 2026`. Falls back to the raw value when malformed. */
export function formatMonthLabel(month: string): string {
  if (!MONTH_PATTERN.test(month)) return month;

  return new Date(`${month}-01T00:00:00Z`).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
