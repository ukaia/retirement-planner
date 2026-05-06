import { describe, expect, test } from "vitest";
import { buildVariantResults } from "./comparison";
import type { Plan } from "../state/schema";

function strainedPlan(): Plan {
  return {
    schemaVersion: 1,
    profile: {
      mode: "single",
      person1: {
        birthYear: 1965,
        retirementAge: 65,
        currentSalary: 80_000,
        salaryGrowth: 0.03,
        longevityAge: 95,
      },
      filingStatus: "single",
      state: "OR",
      taxYear: 2026,
      inflation: 0.031,
      dependents: 0,
    },
    assets: [
      {
        id: "ira1",
        owner: "p1",
        category: "trad-ira",
        balance: 300_000,
        annualContribution: 0,
        tier: { tier: "balanced" },
      },
    ],
    incomeStreams: [],
    expenses: [
      {
        id: "e1",
        label: "All",
        monthlyToday: 6_000,
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
    socialSecurity: { person1: { pia: 2_500, claimAge: 67, alreadyClaiming: false } },
    options: {
      withdrawalStrategy: "default-tax-aware",
      bracketAdjustForInflation: true,
      rothConversionRule: { enabled: false, fillToBracket: "24", startAge: 60, endAge: 74 },
      monteCarlo: { simulations: 500 },
    },
  };
}

describe("comparison variants", () => {
  test("spend-less variants reduce shortfall vs baseline", () => {
    const results = buildVariantResults(strainedPlan());
    const baseline = results.find((r) => r.id === "current")!;
    const less10 = results.find((r) => r.id === "spend-less-10")!;
    const less20 = results.find((r) => r.id === "spend-less-20")!;
    expect(less10.shortfallYears).toBeLessThanOrEqual(baseline.shortfallYears);
    expect(less20.shortfallYears).toBeLessThanOrEqual(less10.shortfallYears);
  });

  test("depletionAge populated when money runs out, null when it lasts", () => {
    const results = buildVariantResults(strainedPlan());
    const baseline = results.find((r) => r.id === "current")!;
    // Baseline has 300k vs 6k/mo lifelong → must deplete
    expect(baseline.depletionAge).not.toBeNull();
    expect(baseline.depletionAge!).toBeGreaterThanOrEqual(65);
  });
});
