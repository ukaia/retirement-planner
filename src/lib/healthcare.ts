import { ACA, LTC, MEDICARE } from "./tax-constants";

export type AcaTier = "bronze" | "silver" | "gold";

const ACA_PREMIUMS: Record<AcaTier, number> = {
  bronze: ACA.bronzePerPerson,
  silver: ACA.silverPerPerson,
  gold: ACA.goldPerPerson,
};

/**
 * Annual ACA premium per person, with linear PTC subsidy phaseout from 100% to 400% FPL.
 * Returns total annual cost (pre-subsidy and post-subsidy).
 */
export function annualAcaCost(args: {
  tier: AcaTier;
  people: 1 | 2;
  year: number; // calendar year (used for medical inflation)
  magi: number;
  baseFpl?: { onePerson: number; twoPerson: number };
}): { gross: number; subsidy: number; net: number } {
  const inflationYears = Math.max(0, args.year - 2026);
  const inflFactor = Math.pow(1 + MEDICARE.medicalInflation, inflationYears);
  const monthly = ACA_PREMIUMS[args.tier] * args.people * inflFactor;
  const gross = monthly * 12;

  const fpl = args.baseFpl
    ? args.people === 1
      ? args.baseFpl.onePerson
      : args.baseFpl.twoPerson
    : args.people === 1
      ? ACA.fpl1Person2026
      : ACA.fpl2Person2026;

  const fplMultiple = args.magi / fpl;
  // Below 100% or above 400%: no subsidy.
  if (fplMultiple < 1 || fplMultiple > ACA.subsidyMaxFplPercent) {
    return { gross, subsidy: 0, net: gross };
  }
  // Linear phase from full subsidy at 100% FPL to 0 at 400% FPL.
  // We approximate "full subsidy" as 80% of premium (a rough national avg).
  const t = (fplMultiple - 1) / (ACA.subsidyMaxFplPercent - 1);
  const subsidyPct = 0.8 * (1 - t);
  const subsidy = gross * subsidyPct;
  return { gross, subsidy, net: Math.max(0, gross - subsidy) };
}

/**
 * Annual Medicare cost per person (Part A + standard Part B + Part D + optional Medigap),
 * before IRMAA. IRMAA is added separately by the engine.
 *
 * Premiums grow at medical inflation from the 2026 base.
 */
export function annualMedicareBase(args: {
  year: number;
  includeMedigap: boolean;
}): number {
  const inflationYears = Math.max(0, args.year - 2026);
  const factor = Math.pow(1 + MEDICARE.medicalInflation, inflationYears);
  const monthly =
    MEDICARE.partAPremium +
    MEDICARE.partBStandardPremium2026 * factor +
    MEDICARE.partDStandalone2026 * factor +
    (args.includeMedigap ? MEDICARE.medigapPlanGMonthly2026 * factor : 0);
  return monthly * 12;
}

/**
 * Long-term care expected annual cost (deterministic, used outside Monte Carlo).
 *   probability * annual_cost * duration / spread_years
 * So a 60% chance of $108k * 2.5 years over a 25-year retirement adds ~$6,480/yr.
 */
export function expectedLtcAnnualCost(args: {
  year: number;
  probability?: number;
  annualCost?: number;
  durationYears?: number;
  spreadOverYears: number; // typically retirement length
}): number {
  const inflationYears = Math.max(0, args.year - 2026);
  const factor = Math.pow(1 + LTC.costInflation, inflationYears);
  const cost = (args.annualCost ?? LTC.defaultAnnualCost2026) * factor;
  const probability = args.probability ?? LTC.defaultProbability;
  const duration = args.durationYears ?? LTC.defaultDurationYears;
  if (args.spreadOverYears <= 0) return 0;
  return (probability * cost * duration) / args.spreadOverYears;
}
