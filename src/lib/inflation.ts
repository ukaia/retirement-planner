/**
 * Convert a nominal dollar amount in `year` to today's dollars (year `baseYear`).
 */
export function toReal(nominal: number, year: number, baseYear: number, inflation: number): number {
  const yearsOut = year - baseYear;
  if (yearsOut <= 0) return nominal;
  return nominal / Math.pow(1 + inflation, yearsOut);
}

/**
 * Inverse: convert today's dollars to nominal at a future year.
 */
export function toNominal(realToday: number, year: number, baseYear: number, inflation: number): number {
  const yearsOut = year - baseYear;
  if (yearsOut <= 0) return realToday;
  return realToday * Math.pow(1 + inflation, yearsOut);
}

/**
 * Common inflation presets named in the spec.
 */
export const INFLATION_PRESETS = {
  reportedAverage: 0.031,
  elevated: 0.045,
  high: 0.060,
} as const;
