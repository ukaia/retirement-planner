import {
  IRMAA_2026,
  IRMAA_INFLATION,
  IRMAA_TOP_TIER_FROZEN_UNTIL,
  type IrmaaTier,
} from "./tax-constants";
import type { FilingStatus } from "./tax-constants";

/**
 * Project IRMAA brackets forward from 2026 using the configured inflation rate.
 * The top tier thresholds remain frozen until IRMAA_TOP_TIER_FROZEN_UNTIL.
 *
 * Premium amounts (Part B / Part D add'l) are NOT inflated here — they are
 * Medicare-set and modeled separately at the Part B medical-inflation rate.
 */
export function irmaaTiersForYear(year: number): IrmaaTier[] {
  if (year <= 2026) return IRMAA_2026;
  const yearsOut = year - 2026;
  return IRMAA_2026.map((t, i) => {
    const isTopTier = i === IRMAA_2026.length - 1;
    const frozen = isTopTier && year < IRMAA_TOP_TIER_FROZEN_UNTIL;
    const factor = frozen ? 1 : Math.pow(1 + IRMAA_INFLATION, yearsOut);
    return {
      singleMagiUpTo: t.singleMagiUpTo === Infinity ? Infinity : t.singleMagiUpTo * factor,
      mfjMagiUpTo: t.mfjMagiUpTo === Infinity ? Infinity : t.mfjMagiUpTo * factor,
      partBPremium: t.partBPremium,
      partDAddl: t.partDAddl,
    };
  });
}

/**
 * Find the IRMAA tier index for a given MAGI in a given year and filing status.
 * MFS uses the same compressed bracket logic as Single (see spec §22.9).
 */
export function findIrmaaTier(args: {
  magi: number;
  year: number;
  filingStatus: FilingStatus;
}): IrmaaTier {
  const tiers = irmaaTiersForYear(args.year);
  const isJoint = args.filingStatus === "mfj" || args.filingStatus === "qss";
  for (const tier of tiers) {
    const cap = isJoint ? tier.mfjMagiUpTo : tier.singleMagiUpTo;
    if (args.magi <= cap) return tier;
  }
  return tiers[tiers.length - 1];
}

/**
 * Annual IRMAA-adjusted Medicare cost per person:
 *   12 * (Part B premium + Part D add'l) [+ standalone Part D base premium, if modeled separately]
 *
 * Uses MAGI from two years prior (the IRS lookback) — caller passes the 2-yr-prior MAGI.
 */
export function annualIrmaaCost(args: {
  magiTwoYearsPrior: number;
  year: number;
  filingStatus: FilingStatus;
}): { tier: IrmaaTier; annual: number } {
  const tier = findIrmaaTier({
    magi: args.magiTwoYearsPrior,
    year: args.year,
    filingStatus: args.filingStatus,
  });
  return { tier, annual: 12 * (tier.partBPremium + tier.partDAddl) };
}

/**
 * Whether MAGI is "near" the next IRMAA cliff — within $5k for cliff warnings.
 */
export function isNearIrmaaCliff(args: {
  magi: number;
  year: number;
  filingStatus: FilingStatus;
  cushion?: number;
}): { near: boolean; nextThreshold: number | null; gap: number } {
  const cushion = args.cushion ?? 5_000;
  const tiers = irmaaTiersForYear(args.year);
  const isJoint = args.filingStatus === "mfj" || args.filingStatus === "qss";
  for (const tier of tiers) {
    const cap = isJoint ? tier.mfjMagiUpTo : tier.singleMagiUpTo;
    if (args.magi <= cap) {
      if (cap === Infinity) return { near: false, nextThreshold: null, gap: Infinity };
      const gap = cap - args.magi;
      return { near: gap <= cushion, nextThreshold: cap, gap };
    }
  }
  return { near: false, nextThreshold: null, gap: Infinity };
}
