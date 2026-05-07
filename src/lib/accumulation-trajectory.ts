import type { Asset, Plan } from "../state/schema";
import { compoundOneYear } from "./growth";
import { tierFor, type TierKey } from "./tax-constants";

export type AssetYearRow = {
  year: number;
  age: number; // owner's age at start of year
  balanceStart: number;
  contribution: number;
  growth: number;
  balanceEnd: number;
};

export type AssetTrajectory = {
  assetId: string;
  label: string;
  category: Asset["category"];
  owner: Asset["owner"];
  annualReturn: number;
  rows: AssetYearRow[];
};

/**
 * Per-asset per-year breakdown of the accumulation phase. Mirrors growth.ts's
 * monthly-compound logic but emits the trajectory so the UI can show year-by-year
 * balance / contribution / growth.
 */
export function accumulationTrajectory(plan: Plan): AssetTrajectory[] {
  const baseYear = plan.profile.taxYear;
  const p1Age = baseYear - plan.profile.person1.birthYear;
  const p2Age =
    plan.profile.person2 !== undefined
      ? baseYear - plan.profile.person2.birthYear
      : null;
  const p1RetireAge = plan.profile.person1.retirementAge;
  const p2RetireAge = plan.profile.person2?.retirementAge ?? null;

  // Salary trajectory mirrors growth.ts exactly.
  const salaryByYear: { p1: Record<number, number>; p2: Record<number, number> } = {
    p1: {},
    p2: {},
  };
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

  const cutoffYears =
    p2Age !== null && p2RetireAge !== null
      ? Math.max(0, Math.min(p1RetireAge - p1Age, p2RetireAge - p2Age))
      : Math.max(0, p1RetireAge - p1Age);

  const out: AssetTrajectory[] = [];

  for (const asset of plan.assets) {
    if (asset.category === "real-estate") {
      let value = asset.marketValue;
      const rows: AssetYearRow[] = [];
      let age = asset.owner === "p2" && p2Age !== null ? p2Age : p1Age;
      for (let i = 0; i < cutoffYears; i++) {
        const year = baseYear + i;
        const balanceStart = value;
        const growth = value * asset.appreciation;
        value += growth;
        rows.push({ year, age, balanceStart, contribution: 0, growth, balanceEnd: value });
        age += 1;
      }
      out.push({
        assetId: asset.id,
        label: asset.nickname ?? `${asset.category} (${asset.subtype})`,
        category: asset.category,
        owner: asset.owner,
        annualReturn: asset.appreciation,
        rows,
      });
      continue;
    }

    if (asset.category === "other") {
      const ret = asset.expectedReturn ?? asset.appreciation ?? 0;
      let value = asset.balance;
      const rows: AssetYearRow[] = [];
      let age = asset.owner === "p2" && p2Age !== null ? p2Age : p1Age;
      for (let i = 0; i < cutoffYears; i++) {
        const year = baseYear + i;
        const balanceStart = value;
        const growth = value * ret;
        value += growth;
        rows.push({ year, age, balanceStart, contribution: 0, growth, balanceEnd: value });
        age += 1;
      }
      out.push({
        assetId: asset.id,
        label: asset.nickname ?? `${asset.category} (${asset.subtype})`,
        category: asset.category,
        owner: asset.owner,
        annualReturn: ret,
        rows,
      });
      continue;
    }

    // Investable: monthly compounding with contributions.
    const tier = asset.tier;
    const annualReturn =
      tier.tier === "custom" && tier.customMean !== undefined
        ? tier.customMean
        : tierFor(tier.tier as TierKey).mean;
    let bal = asset.balance;
    const rows: AssetYearRow[] = [];
    let age = asset.owner === "p2" && p2Age !== null ? p2Age : p1Age;

    for (let i = 0; i < cutoffYears; i++) {
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
        case "hsa":
          annualContribution = asset.annualContribution ?? 0;
          break;
        case "brokerage":
          annualContribution = (asset.monthlyContribution ?? 0) * 12;
          break;
      }

      const balanceStart = bal;
      bal = compoundOneYear({ startBalance: bal, annualContribution, annualReturn });
      const balanceEnd = bal;
      // Growth = balance change minus contributions added this year.
      const growth = balanceEnd - balanceStart - annualContribution;
      rows.push({
        year,
        age,
        balanceStart,
        contribution: annualContribution,
        growth,
        balanceEnd,
      });
      age += 1;
    }

    out.push({
      assetId: asset.id,
      label: asset.nickname ?? asset.category,
      category: asset.category,
      owner: asset.owner,
      annualReturn,
      rows,
    });
  }

  return out;
}
