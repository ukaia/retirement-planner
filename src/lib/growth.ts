import type { Asset, Plan } from "../state/schema";
import { tierFor, type TierKey } from "./tax-constants";

function tierMean(asset: Extract<Asset, { tier: { tier: TierKey } }>): number {
  if (asset.tier.tier === "custom" && asset.tier.customMean !== undefined) {
    return asset.tier.customMean;
  }
  return tierFor(asset.tier.tier).mean;
}

/**
 * Compute the year-end balance of a single account compounded monthly with
 * a steady annual contribution. Annual contribution is split into 12 equal
 * monthly deposits; deposits compound at the same monthly rate as the balance.
 */
export function compoundOneYear(args: {
  startBalance: number;
  annualContribution: number;
  annualReturn: number;
}): number {
  const monthly = args.annualReturn / 12;
  const m = args.annualContribution / 12;
  let bal = args.startBalance;
  for (let i = 0; i < 12; i++) {
    bal = bal * (1 + monthly) + m;
    // Net negative flow (pre-retirement withdrawals exceed contributions plus
    // growth) can drive balance below zero; clamp so the bucket can only drain
    // to empty rather than going negative.
    if (bal < 0) bal = 0;
  }
  return bal;
}

/**
 * Project pre-retirement growth of all assets from "now" to each person's retirement.
 * Returns the asset balances at the start of the retirement projection, plus the
 * salary trajectory for each person.
 */
export type AccumulationResult = {
  /** Map: assetId → projected balance at the relevant retirement year. */
  balanceByAsset: Record<string, number>;
  /** Salary by year, per person, while still working (year keyed to calendar year). */
  salaryByYear: { p1: Record<number, number>; p2: Record<number, number> };
  /** Cost basis for brokerage accounts (tracked from contributions if not user-set). */
  basisByAsset: Record<string, number>;
};

export function accumulateToRetirement(plan: Plan): AccumulationResult {
  const baseYear = plan.profile.taxYear;
  const p1Age = baseYear - plan.profile.person1.birthYear;
  const p2Age =
    plan.profile.person2 !== undefined
      ? baseYear - plan.profile.person2.birthYear
      : null;
  const p1RetireAge = plan.profile.person1.retirementAge;
  const p2RetireAge = plan.profile.person2?.retirementAge ?? null;

  const balanceByAsset: Record<string, number> = {};
  const basisByAsset: Record<string, number> = {};
  const salaryByYear: AccumulationResult["salaryByYear"] = { p1: {}, p2: {} };

  // Salary trajectory
  let p1Salary = plan.profile.person1.currentSalary;
  let p2Salary = plan.profile.person2?.currentSalary ?? 0;
  for (let yearOffset = 0; yearOffset <= 60; yearOffset++) {
    const year = baseYear + yearOffset;
    const p1AgeY = p1Age + yearOffset;
    const p2AgeY = p2Age !== null ? p2Age + yearOffset : null;
    if (p1AgeY < p1RetireAge) {
      salaryByYear.p1[year] = p1Salary;
      p1Salary *= 1 + plan.profile.person1.salaryGrowth;
    }
    if (p2AgeY !== null && p2RetireAge !== null && p2AgeY < p2RetireAge) {
      salaryByYear.p2[year] = p2Salary;
      p2Salary *= 1 + plan.profile.person2!.salaryGrowth;
    }
  }

  // Stop accumulation at the EARLIER of the two retire years (the projection's
  // start year). For couples with split retirement, projection.ts handles the
  // still-working spouse's contributions during the overlap. Avoids
  // double-counting growth on the later-retiring spouse's assets.
  const cutoffYears =
    p2Age !== null && p2RetireAge !== null
      ? Math.max(0, Math.min(p1RetireAge - p1Age, p2RetireAge - p2Age))
      : Math.max(0, p1RetireAge - p1Age);

  // Each asset gets compounded year-by-year from baseYear to the projection start.
  for (const asset of plan.assets) {
    if (asset.category === "real-estate") {
      // Appreciation per year, no contributions.
      let value = asset.marketValue;
      for (let i = 0; i < cutoffYears; i++) value *= 1 + asset.appreciation;
      balanceByAsset[asset.id] = value;
      basisByAsset[asset.id] = asset.basis > 0 ? asset.basis : asset.marketValue;
      continue;
    }

    if (asset.category === "other") {
      const ret = asset.expectedReturn ?? asset.appreciation ?? 0;
      let value = asset.balance;
      for (let i = 0; i < cutoffYears; i++) value *= 1 + ret;
      balanceByAsset[asset.id] = value;
      basisByAsset[asset.id] = asset.costBasis ?? asset.balance;
      continue;
    }

    // Investable account (retirement or brokerage): monthly compounding with contributions.
    const annualReturn = tierMean(asset);
    let bal = asset.balance;
    let basis = asset.category === "brokerage" ? asset.costBasis : asset.balance;

    let yearAge =
      asset.owner === "p2" && p2Age !== null ? p2Age : p1Age;
    const yearsToRetire = cutoffYears;

    for (let i = 0; i < yearsToRetire; i++) {
      const year = baseYear + i;
      let annualContribution = 0;

      switch (asset.category) {
        case "trad-401k":
        case "roth-401k": {
          const ownerSalary =
            asset.owner === "p2"
              ? salaryByYear.p2[year] ?? 0
              : salaryByYear.p1[year] ?? 0;
          const employee = ownerSalary * (asset.contributionPct ?? 0);
          const match = ownerSalary * (asset.employerMatchPct ?? 0);
          annualContribution = employee + match;
          break;
        }
        case "trad-ira":
        case "roth-ira":
        case "sep-ira":
        case "hsa": {
          annualContribution = asset.annualContribution ?? 0;
          break;
        }
        case "brokerage": {
          annualContribution = (asset.monthlyContribution ?? 0) * 12;
          // Pre-retirement withdrawals (CoastFire / BaristaFire / lifestyle
          // funding while still working). Subtract from the net flow each
          // year the owner is in the withdrawal window. End age defaults to
          // retirement, so leaving it unset means "withdraw until I retire".
          const wdMonthly = asset.preRetMonthlyWithdrawal ?? 0;
          const wdStart = asset.preRetWithdrawalStartAge;
          if (wdMonthly > 0 && wdStart !== undefined) {
            const wdEnd = asset.preRetWithdrawalEndAge ?? Number.POSITIVE_INFINITY;
            if (yearAge >= wdStart && yearAge < wdEnd) {
              annualContribution -= wdMonthly * 12;
            }
          }
          break;
        }
      }

      const balPreCompound = bal;
      bal = compoundOneYear({
        startBalance: bal,
        annualContribution,
        annualReturn,
      });

      // Brokerage: contributions add to cost basis dollar-for-dollar. When the
      // net flow is negative (pre-retirement withdrawal exceeds contribution),
      // the withdrawal consumes basis proportionally to the bucket's current
      // basis fraction so the LTCG mix at retirement reflects reality.
      if (asset.category === "brokerage") {
        if (annualContribution >= 0) {
          basis += annualContribution;
        } else {
          const wd = -annualContribution;
          // Approximate basis fraction using mid-year value (grown bucket pre-wd).
          const grownBefore = balPreCompound * (1 + annualReturn);
          if (grownBefore > 0) {
            const basisFraction = Math.min(1, basis / grownBefore);
            basis -= wd * basisFraction;
          }
          if (basis < 0) basis = 0;
        }
      }

      yearAge += 1;
    }

    void yearAge;
    balanceByAsset[asset.id] = bal;
    basisByAsset[asset.id] = basis;
  }

  return { balanceByAsset, salaryByYear, basisByAsset };
}
