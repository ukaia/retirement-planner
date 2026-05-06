import { describe, expect, test } from "vitest";
import { projectPlan } from "./projection";
import type { Plan } from "../state/schema";

function basePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    schemaVersion: 1,
    profile: {
      mode: "single",
      person1: {
        birthYear: 1965,
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
      monteCarlo: { simulations: 500 },
    },
    ...overrides,
  };
}

describe("projectPlan", () => {
  test("produces one row per retirement year through plan-to age", () => {
    const plan = basePlan();
    const rows = projectPlan(plan);
    // 2026 base, retire at 65 (born 1965 → age 61 in 2026, retire in 2030)
    // plan-to 95 → 2060. Rows: 2030..2060 = 31 years.
    expect(rows.length).toBe(31);
    expect(rows[0].year).toBe(2030);
    expect(rows[rows.length - 1].year).toBe(2060);
  });

  test("SS kicks in at claim age and not before", () => {
    const plan = basePlan();
    const rows = projectPlan(plan);
    const at65 = rows.find((r) => r.p1Age === 65)!;
    const at67 = rows.find((r) => r.p1Age === 67)!;
    expect(at65.ssP1).toBe(0);
    expect(at67.ssP1).toBeGreaterThan(0);
  });

  test("Medicare costs only kick in at 65+", () => {
    const plan = basePlan();
    const rows = projectPlan(plan);
    const at65 = rows.find((r) => r.p1Age === 65)!;
    const at70 = rows.find((r) => r.p1Age === 70)!;
    expect(at65.medicareCost).toBeGreaterThan(0);
    expect(at70.medicareCost).toBeGreaterThan(at65.medicareCost); // medical inflation
  });

  test("RMDs kick in at age 75 for someone born 1965", () => {
    const plan = basePlan({
      assets: [
        {
          id: "ira1",
          owner: "p1",
          category: "trad-ira",
          balance: 1_000_000,
          annualContribution: 0,
          tier: { tier: "balanced" },
        },
      ],
    });
    const rows = projectPlan(plan);
    const at74 = rows.find((r) => r.p1Age === 74)!;
    const at75 = rows.find((r) => r.p1Age === 75)!;
    expect(at74.rmdTotal).toBe(0);
    expect(at75.rmdTotal).toBeGreaterThan(0);
  });

  test("pension income flows in starting at startAge", () => {
    const plan = basePlan({
      assets: [
        {
          id: "p",
          owner: "p1",
          category: "other",
          balance: 0,
          subtype: "pension",
          monthlyBenefit: 2_000,
          startAge: 65,
          cola: 0.02,
        },
      ],
    });
    const rows = projectPlan(plan);
    const at65 = rows.find((r) => r.p1Age === 65)!;
    expect(at65.pensions).toBeCloseTo(2_000 * 12, -1);
  });

  test("estate value declines if expenses exceed sustainable income", () => {
    const plan = basePlan({
      assets: [
        {
          id: "ira1",
          owner: "p1",
          category: "trad-ira",
          balance: 200_000, // small relative to expenses
          annualContribution: 0,
          tier: { tier: "balanced" },
        },
      ],
      expenses: [
        {
          id: "e1",
          label: "All expenses",
          monthlyToday: 6_000,
          growth: 0,
          startAge: null,
          endAge: null,
          phaseOutAtAge: null,
          stepChange: null,
        },
      ],
    });
    const rows = projectPlan(plan);
    expect(rows[0].estateValue).toBeGreaterThan(rows[rows.length - 1].estateValue);
  });
});
