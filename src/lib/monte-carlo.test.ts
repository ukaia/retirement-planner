import { describe, expect, test } from "vitest";
import { gaussian, mulberry32, runMonteCarlo } from "./monte-carlo";
import type { Plan } from "../state/schema";

describe("mulberry32", () => {
  test("seeded sequence is reproducible", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 5; i++) {
      expect(a()).toBe(b());
    }
  });
});

describe("gaussian", () => {
  test("approx mean=0 stdev=1 over many draws", () => {
    const rand = mulberry32(7);
    let sum = 0;
    let sqsum = 0;
    const n = 5_000;
    for (let i = 0; i < n; i++) {
      const g = gaussian(rand);
      sum += g;
      sqsum += g * g;
    }
    const mean = sum / n;
    const variance = sqsum / n - mean * mean;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(variance - 1)).toBeLessThan(0.1);
  });
});

function basePlan(): Plan {
  return {
    schemaVersion: 1,
    profile: {
      mode: "single",
      person1: {
        birthYear: 1965,
        retirementAge: 65,
        currentSalary: 0,
        salaryGrowth: 0.03,
        longevityAge: 90,
      },
      filingStatus: "single",
      state: "AK",
      taxYear: 2026,
      inflation: 0.031,
      dependents: 0,
    },
    assets: [
      {
        id: "ira",
        owner: "p1",
        category: "trad-ira",
        balance: 1_500_000,
        annualContribution: 0,
        tier: { tier: "balanced" },
      },
    ],
    incomeStreams: [],
    expenses: [
      {
        id: "e1",
        label: "Living",
        monthlyToday: 5_000,
        growth: 0,
        startAge: null,
        endAge: null,
        phaseOutAtAge: null,
        stepChange: null,
      },
    ],
    healthcare: {
      acaTier: "silver",
      medigap: false,
      ltc: {
        enabled: false,
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
      monteCarlo: { simulations: 100 },
    },
    safeSpend: { method: "monte-carlo", mcThreshold: 0.9 },
  };
}

describe("runMonteCarlo", () => {
  test("returns successRate in [0,1]", () => {
    const r = runMonteCarlo({ plan: basePlan(), simulations: 50, seed: 1 });
    expect(r.successRate).toBeGreaterThanOrEqual(0);
    expect(r.successRate).toBeLessThanOrEqual(1);
  });

  test("p10 ≤ p50 ≤ p90 at every year", () => {
    const r = runMonteCarlo({ plan: basePlan(), simulations: 100, seed: 2 });
    const { p10, p50, p90 } = r.percentiles.bands;
    for (let i = 0; i < p10.length; i++) {
      expect(p10[i]).toBeLessThanOrEqual(p50[i]);
      expect(p50[i]).toBeLessThanOrEqual(p90[i]);
    }
  });

  test("retirementTier de-risk reduces final estate spread", () => {
    const aggressive = basePlan();
    aggressive.assets[0] = {
      ...aggressive.assets[0],
      tier: { tier: "growth" },
    } as Plan["assets"][number];
    const glided: Plan = {
      ...aggressive,
      assets: [
        {
          ...aggressive.assets[0],
          retirementTier: { tier: "income-growth" },
        } as Plan["assets"][number],
      ],
    };
    const a = runMonteCarlo({ plan: aggressive, simulations: 100, seed: 5 });
    const g = runMonteCarlo({ plan: glided, simulations: 100, seed: 5 });
    const aSpread =
      a.finalEstateDistribution[a.finalEstateDistribution.length - 1] -
      a.finalEstateDistribution[0];
    const gSpread =
      g.finalEstateDistribution[g.finalEstateDistribution.length - 1] -
      g.finalEstateDistribution[0];
    expect(gSpread).toBeLessThan(aSpread);
  });

  test("seeded runs are reproducible", () => {
    const a = runMonteCarlo({ plan: basePlan(), simulations: 30, seed: 99 });
    const b = runMonteCarlo({ plan: basePlan(), simulations: 30, seed: 99 });
    expect(a.successRate).toBe(b.successRate);
    expect(a.finalEstateDistribution[0]).toBeCloseTo(b.finalEstateDistribution[0], 2);
  });
});
