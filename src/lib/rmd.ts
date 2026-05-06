import { UNIFORM_LIFETIME_TABLE, rmdStartAge } from "./tax-constants";

/**
 * Returns the divisor (Uniform Lifetime Table factor) for a given age.
 * For ages below the RMD-start age, returns Infinity (no RMD).
 * For ages above 120, returns the floor at 2.0.
 */
export function lifetimeFactor(age: number): number {
  if (age < 73) return Infinity;
  if (age >= 120) return 2.0;
  const f = UNIFORM_LIFETIME_TABLE[age];
  if (f !== undefined) return f;
  // Should not happen given complete table, but safety net.
  return UNIFORM_LIFETIME_TABLE[Math.min(120, Math.max(73, Math.floor(age)))];
}

/**
 * Compute Required Minimum Distribution for a single tax-deferred account.
 * RMD = prior year-end balance / Uniform Lifetime Table factor.
 *
 * Returns 0 if owner has not yet reached RMD-start age this year.
 * Roth IRAs and post-2024 Roth 401(k)s do NOT have RMDs — caller decides.
 */
export function computeRmd(args: {
  priorYearEndBalance: number;
  ownerAgeAtYearEnd: number;
  ownerBirthYear: number;
}): number {
  const startAge = rmdStartAge(args.ownerBirthYear);
  if (args.ownerAgeAtYearEnd < startAge) return 0;
  const factor = lifetimeFactor(args.ownerAgeAtYearEnd);
  if (!isFinite(factor) || factor === 0) return 0;
  return args.priorYearEndBalance / factor;
}
