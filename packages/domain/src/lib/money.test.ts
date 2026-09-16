import { describe, expect, it } from 'vitest';
import { formatMinorUnits, toMinorUnits, toUnits } from './money';

describe('money (integer minor units)', () => {
  it('converts whole units to minor units without floating drift', () => {
    expect(toMinorUnits(100)).toBe(10000);
    expect(toMinorUnits(249.9)).toBe(24990);
  });

  it('round-trips minor units back to units', () => {
    expect(toUnits(25000)).toBe(250);
  });

  it('formats minor units as a currency string', () => {
    expect(formatMinorUnits(100000, 'USD')).toBe('$1,000.00');
    expect(formatMinorUnits(100000, 'EUR')).toBe('€1,000.00');
  });

  it('rejects non-finite or non-integer inputs', () => {
    expect(() => toMinorUnits(Number.NaN)).toThrow(RangeError);
    expect(() => toMinorUnits(Infinity)).toThrow(RangeError);
    expect(() => toUnits(1.5)).toThrow(RangeError);
  });
});
