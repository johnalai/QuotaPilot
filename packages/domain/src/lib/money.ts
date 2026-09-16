/**
 * Money as integer minor units + ISO-4217 currency — never floats.
 * These helpers keep unit ⇄ minor-unit conversion exact and centralized
 * (architecture: "money = integer minor units"; financial integrity rule).
 */

export const MINOR_UNITS_PER_UNIT = 100;

/** Convert whole currency units (e.g. 249.90) to integer minor units (24990). */
export function toMinorUnits(units: number): number {
  if (!Number.isFinite(units)) {
    throw new RangeError('amount (units) must be a finite number');
  }
  return Math.round(units * MINOR_UNITS_PER_UNIT);
}

/** Convert integer minor units back to whole units for display. */
export function toUnits(minorUnits: number): number {
  if (!Number.isInteger(minorUnits) || !Number.isFinite(minorUnits)) {
    throw new RangeError('minorUnits must be a finite integer');
  }
  return minorUnits / MINOR_UNITS_PER_UNIT;
}

/** Format minor units as a currency string for the given ISO-4217 code. */
export function formatMinorUnits(minorUnits: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(toUnits(minorUnits));
}
