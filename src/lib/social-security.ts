import { SS, fraMonths } from "./tax-constants";

/**
 * Compute the benefit at a given claim age given Primary Insurance Amount (PIA at FRA).
 *
 * Reduction for early claim:
 *   - First 36 months before FRA: 5/9 of 1% per month.
 *   - Beyond 36 months: 5/12 of 1% per month.
 * Delayed retirement credits past FRA:
 *   - 8% per year (2/3 of 1% per month) up to age 70.
 */
export function benefitAtClaimAge(args: {
  pia: number;
  claimAgeMonths: number;
  birthYear: number;
}): number {
  const fra = fraMonths(args.birthYear);
  const ageInMonths = args.claimAgeMonths;

  // Cap claim at 70 (no DRCs past 70).
  const cap70 = 70 * 12;
  const months = Math.min(ageInMonths, cap70);

  if (months === fra) return args.pia;

  if (months < fra) {
    const monthsEarly = fra - months;
    const first36 = Math.min(monthsEarly, 36);
    const beyond = Math.max(0, monthsEarly - 36);
    const reduction = first36 * (5 / 900) + beyond * (5 / 1200);
    return args.pia * (1 - reduction);
  }

  // months > fra
  const monthsLate = months - fra;
  const drc = monthsLate * (2 / 300); // 2/3 of 1% per month
  return args.pia * (1 + drc);
}

/**
 * Spousal benefit. Lower earner can claim up to 50% of higher earner's PIA at FRA.
 * Reduced if claimed early (same reduction rules as own benefit).
 * No delayed retirement credits on spousal.
 */
export function spousalBenefit(args: {
  higherEarnerPia: number;
  claimAgeMonths: number;
  birthYear: number;
}): number {
  const fra = fraMonths(args.birthYear);
  const halfPia = args.higherEarnerPia * 0.5;
  if (args.claimAgeMonths >= fra) return halfPia; // no DRCs on spousal

  const monthsEarly = fra - args.claimAgeMonths;
  const first36 = Math.min(monthsEarly, 36);
  const beyond = Math.max(0, monthsEarly - 36);
  const reduction = first36 * (25 / 3600) + beyond * (5 / 1200);
  return halfPia * (1 - reduction);
}

/**
 * Survivor benefit. The surviving spouse gets the larger of:
 *  - their own current benefit, or
 *  - the deceased spouse's actual benefit at death (including any DRCs).
 * Surviving spouse can collect from FRA at 100%, less if earlier (we don't model that here).
 */
export function survivorBenefit(args: {
  ownBenefit: number;
  deceasedBenefit: number;
}): number {
  return Math.max(args.ownBenefit, args.deceasedBenefit);
}

/**
 * Earnings test: $1 withheld per $2 above limit if under FRA all year.
 * In year of FRA: $1 per $3 above (higher) limit, applied only to months before FRA month.
 *
 * Returns dollar amount of benefits *withheld* (not eliminated; restored at FRA via PIA recompute).
 */
export function earningsTestWithholding(args: {
  wages: number;
  ageMonthsAtYearStart: number;
  birthYear: number;
}): number {
  const fra = fraMonths(args.birthYear);
  const startMonths = args.ageMonthsAtYearStart;
  const endMonths = startMonths + 12;

  if (startMonths >= fra) return 0; // already FRA, no test

  if (endMonths <= fra) {
    // Under FRA all year.
    const excess = Math.max(0, args.wages - SS.earningsTestUnderFRA.limit);
    return excess * SS.earningsTestUnderFRA.withholdRatio;
  }

  // Year of FRA: only earnings before FRA month count, against the higher limit.
  // Approximate by prorating: the fraction of the year before FRA.
  const monthsBeforeFra = Math.max(0, fra - startMonths);
  const wagesBefore = args.wages * (monthsBeforeFra / 12);
  const excess = Math.max(0, wagesBefore - SS.earningsTestYearOfFRA.limit);
  return excess * SS.earningsTestYearOfFRA.withholdRatio;
}

/**
 * Build a heatmap: lifetime cumulative benefits across claim-age combinations,
 * for one or two earners (couple). Used for the optimal-claim chart.
 */
export type ClaimHeatmap = {
  ages: number[]; // 62..70
  values: number[][]; // [p1AgeIdx][p2AgeIdx] → cumulative lifetime benefit
};

export function buildClaimHeatmap(args: {
  person1: { pia: number; birthYear: number; longevityAge: number };
  person2?: { pia: number; birthYear: number; longevityAge: number };
}): ClaimHeatmap {
  const ages = [62, 63, 64, 65, 66, 67, 68, 69, 70];
  const values: number[][] = [];

  const lifetime = (
    pia: number,
    birthYear: number,
    claimAge: number,
    longevity: number,
  ) => {
    const monthly = benefitAtClaimAge({
      pia,
      claimAgeMonths: claimAge * 12,
      birthYear,
    });
    const yearsCollecting = Math.max(0, longevity - claimAge);
    return monthly * 12 * yearsCollecting;
  };

  for (const a1 of ages) {
    const row: number[] = [];
    for (const a2 of ages) {
      let total = lifetime(args.person1.pia, args.person1.birthYear, a1, args.person1.longevityAge);
      if (args.person2) {
        total += lifetime(
          args.person2.pia,
          args.person2.birthYear,
          a2,
          args.person2.longevityAge,
        );
      }
      row.push(total);
    }
    values.push(row);
  }
  return { ages, values };
}
