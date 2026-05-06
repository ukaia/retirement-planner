import { describe, expect, test } from "vitest";
import { accumulateToRetirement, compoundOneYear } from "./growth";
import type { Plan } from "../state/schema";

describe("compoundOneYear", () => {
  test("zero return, zero contribution", () => {
    expect(
      compoundOneYear({ startBalance: 100_000, annualContribution: 0, annualReturn: 0 }),
    ).toBeCloseTo(100_000, 2);
  });

  test("$10k contribution at 0% adds $10k", () => {
    expect(
      compoundOneYear({ startBalance: 0, annualContribution: 10_000, annualReturn: 0 }),
    ).toBeCloseTo(10_000, 2);
  });

  test("$100k at 12% no contribution → ~$112,683 (monthly compounded)", () => {
    const r = compoundOneYear({
      startBalance: 100_000,
      annualContribution: 0,
      annualReturn: 0.12,
    });
    // (1 + 0.01)^12 = 1.126825
    expect(r).toBeCloseTo(100_000 * Math.pow(1.01, 12), 0);
  });
});

describe("accumulateToRetirement", () => {
  function basePlan(): Plan {
    return {
      schemaVersion: 1,
      profile: {
        mode: "single",
        person1: {
          birthYear: 1980,
          retirementAge: 65,
          currentSalary: 100_000,
          salaryGrowth: 0.03,
          longevityAge: 95,
        },
        filingStatus: "single",
        state: "OR",
        taxYear: 2026,
        inflation: 0.031,
        dependents: 0,
      },
      assets: [],
      incomeStreams: [],
      expenses: [],
      healthcare: {
        acaTier: "silver",
        medigap: false,
        ltc: {
          enabled: true,
          probability: 0.6,
          annualCost: 108_000,
          durationYears: 2.5,
          insurance: { enabled: false, annualPremium: 0, dailyBenefit: 0 },
        },
      },
      socialSecurity: {
        person1: { pia: 3_000, claimAge: 67, alreadyClaiming: false },
      },
      options: {
        withdrawalStrategy: "default-tax-aware",
        bracketAdjustForInflation: true,
        rothConversionRule: { enabled: false, fillToBracket: "24", startAge: 60, endAge: 74 },
        monteCarlo: { simulations: 500 },
      },
    };
  }

  test("brokerage at Growth/Income (9.62%) over 19 years from age 46 to 65", () => {
    const plan = basePlan();
    plan.assets = [
      {
        id: "a1",
        owner: "p1",
        category: "brokerage",
        balance: 100_000,
        monthlyContribution: 0,
        costBasis: 100_000,
        tier: { tier: "growth-income" },
      },
    ];
    const r = accumulateToRetirement(plan);
    // Age now (2026 - 1980) = 46, retire at 65 → 19 years.
    // 100k * (1 + .0962/12)^(12*19) ≈ 100k * 6.07x
    const expected = 100_000 * Math.pow(1 + 0.0962 / 12, 12 * 19);
    expect(r.balanceByAsset.a1).toBeCloseTo(expected, -1);
  });

  test("salary trajectory growth", () => {
    const plan = basePlan();
    const r = accumulateToRetirement(plan);
    expect(r.salaryByYear.p1[2026]).toBeCloseTo(100_000, 2);
    expect(r.salaryByYear.p1[2027]).toBeCloseTo(103_000, 2);
    expect(r.salaryByYear.p1[2030]).toBeCloseTo(100_000 * Math.pow(1.03, 4), 0);
  });

  test("real estate appreciates and stops contributing", () => {
    const plan = basePlan();
    plan.assets = [
      {
        id: "h1",
        owner: "joint",
        category: "real-estate",
        subtype: "primary",
        balance: 0,
        marketValue: 500_000,
        appreciation: 0.035,
        mortgageBalance: 0,
        basis: 200_000,
        yearsOwned: 10,
        monthlyRentIncome: 0,
        monthlyRentExpense: 0,
        actionAtRetirement: "hold",
      },
    ];
    const r = accumulateToRetirement(plan);
    expect(r.balanceByAsset.h1).toBeCloseTo(500_000 * Math.pow(1.035, 19), 0);
  });

  test("401(k) with employee + employer match grows from salary", () => {
    const plan = basePlan();
    plan.assets = [
      {
        id: "k1",
        owner: "p1",
        category: "trad-401k",
        balance: 50_000,
        contributionPct: 0.10,
        employerMatchPct: 0.04,
        tier: { tier: "balanced" },
      },
    ];
    const r = accumulateToRetirement(plan);
    expect(r.balanceByAsset.k1).toBeGreaterThan(50_000); // grew
    // ~19 years at 8.12% with $14k contributions growing 3%/y → multiple hundreds of thousands.
    expect(r.balanceByAsset.k1).toBeGreaterThan(500_000);
  });
});
