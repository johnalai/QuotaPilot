/**
 * Money formatting.
 *
 * QuotaPilot stores every monetary amount as an **integer in minor units**
 * plus an ISO currency code (CLAUDE.md §3 — "no float money"). Amounts crossing
 * this boundary are therefore always minor units: 100000 → "$1,000.00".
 *
 * Never format a raw minor-unit number with a plain number formatter, and never
 * round-trip money through a float.
 */
export function formatCurrency(
  amountInMinorUnits: number,
  currency = 'USD',
  locale = 'en-US',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amountInMinorUnits / 100);
}

/** Parse a user-typed major-unit string (e.g. "1,250.50") into minor units. */
export function toMinorUnits(majorUnits: string | number): number {
  const value =
    typeof majorUnits === 'number' ? majorUnits : Number(majorUnits.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/** Render minor units as a plain major-unit string for form inputs. */
export function toMajorUnitsInput(amountInMinorUnits: number): string {
  return (amountInMinorUnits / 100).toFixed(2);
}
