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

  test("growth fields populate post first year and total matches sum", () => {
    const plan = basePlan({
      assets: [
        {
          id: "ira1",
          owner: "p1",
          category: "trad-ira",
          balance: 500_000,
          annualContribution: 0,
          tier: { tier: "balanced" },
        },
      ],
    });
    const rows = projectPlan(plan);
    // First year: no growth applied yet (start-of-year compound skipped on yearIdx 0)
    expect(rows[0].growthTotal).toBe(0);
    // Year 2: traditional bucket should have grown
    const yr2 = rows[1];
    expect(yr2.growthTraditional).toBeGreaterThan(0);
    expect(yr2.growthTotal).toBeCloseTo(
      yr2.growthTaxable +
        yr2.growthTraditional +
        yr2.growthRoth +
        yr2.growthHsa +
        yr2.growthRealEstate +
        yr2.growthOther,
      2,
    );
  });

  test("sell-when-needed real estate covers shortfall before liquid assets dry up", () => {
    const planWithoutSale = basePlan({
      assets: [
        {
          id: "ira",
          owner: "p1",
          category: "trad-ira",
          balance: 150_000,
          annualContribution: 0,
          tier: { tier: "balanced" },
        },
        {
          id: "house",
          owner: "p1",
          category: "real-estate",
          subtype: "vacation",
          balance: 600_000,
          marketValue: 600_000,
          appreciation: 0.03,
          mortgageBalance: 0,
          basis: 200_000,
          yearsOwned: 10,
          monthlyRentIncome: 0,
          monthlyRentExpense: 0,
          actionAtRetirement: "hold",
        },
      ],
      expenses: [
        {
          id: "e1",
          label: "All",
          monthlyToday: 8_000,
          growth: 0,
          startAge: null,
          endAge: null,
          phaseOutAtAge: null,
          stepChange: null,
        },
      ],
    });
    const baselineRows = projectPlan(planWithoutSale);
    const baselineShortfall = baselineRows.reduce((s, r) => s + r.shortfall, 0);
    expect(baselineShortfall).toBeGreaterThan(0); // baseline must run out

    // Same plan but mark the house as sell-when-needed.
    const planWithSale = structuredClone(planWithoutSale);
    const re = planWithSale.assets.find((a) => a.id === "house")!;
    if (re.category === "real-estate") {
      re.actionAtRetirement = "sell-when-needed";
    }
    const saleRows = projectPlan(planWithSale);
    const saleShortfall = saleRows.reduce((s, r) => s + r.shortfall, 0);
    expect(saleShortfall).toBeLessThan(baselineShortfall);
  });

  test("liquidate-at-age fires on the configured year only", () => {
    const plan = basePlan({
      assets: [
        {
          id: "house",
          owner: "p1",
          category: "real-estate",
          subtype: "vacation",
          balance: 400_000,
          marketValue: 400_000,
          appreciation: 0.03,
          mortgageBalance: 0,
          basis: 200_000,
          yearsOwned: 10,
          monthlyRentIncome: 0,
          monthlyRentExpense: 0,
          actionAtRetirement: "liquidate-at-age",
          liquidateAtAge: 75,
        },
      ],
    });
    const rows = projectPlan(plan);
    const at74 = rows.find((r) => r.p1Age === 74)!;
    const at75 = rows.find((r) => r.p1Age === 75)!;
    const at76 = rows.find((r) => r.p1Age === 76)!;
    expect(at74.realEstateValue).toBeGreaterThan(0);
    expect(at75.realEstateValue).toBe(0); // liquidated at 75
    expect(at76.realEstateValue).toBe(0);
  });

  test("retirementTier produces a different (lower) growth than tier when de-risked", () => {
    const aggressive: Plan = basePlan({
      assets: [
        {
          id: "ira",
          owner: "p1",
          category: "trad-ira",
          balance: 500_000,
          annualContribution: 0,
          tier: { tier: "growth" }, // 12.49%
        },
      ],
      // skip expenses so withdrawals don't muddy the growth signal
      expenses: [],
    });
    const glided: Plan = basePlan({
      assets: [
        {
          id: "ira",
          owner: "p1",
          category: "trad-ira",
          balance: 500_000,
          annualContribution: 0,
          tier: { tier: "growth" },
          retirementTier: { tier: "income-growth" }, // 5.96%
        },
      ],
      expenses: [],
    });
    const aRows = projectPlan(aggressive);
    const gRows = projectPlan(glided);
    const yr5A = aRows[5];
    const yr5G = gRows[5];
    expect(yr5A.growthTraditional).toBeGreaterThan(yr5G.growthTraditional);
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
