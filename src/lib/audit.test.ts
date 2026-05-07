/**
 * Final audit: verify all outputs are sane after the recent fixes.
 * Each test asserts an invariant that any of the recent regressions would break.
 */

import { describe, expect, test } from "vitest";
import { computeSafeSpend, computeSavingsGap } from "./safe-spend";
import { effectiveReturns, projectPlan } from "./projection";
import { accumulateToRetirement } from "./growth";
import type { Plan, SafeSpendMethod } from "../state/schema";

function basePlan(method: SafeSpendMethod = "drain-zero"): Plan {
  return {
    schemaVersion: 1,
    profile: {
      mode: "single",
      person1: {
        birthYear: 1981,
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
    assets: [
      { id: "k", owner: "p1", category: "trad-401k", balance: 100_000, contributionPct: 0.05, tier: { tier: "balanced" } },
      { id: "ira", owner: "p1", category: "trad-ira", balance: 30_000, annualContribution: 0, tier: { tier: "growth" } },
    ],
    incomeStreams: [],
    expenses: [{ id: "e1", label: "Living", monthlyToday: 5000, growth: 0, startAge: null, endAge: null, phaseOutAtAge: null, stepChange: null }],
    healthcare: { acaTier: "silver", medigap: false, ltc: { enabled: false, probability: 0.6, annualCost: 108_000, durationYears: 2.5, insurance: { enabled: false, annualPremium: 0, dailyBenefit: 0 } } },
    socialSecurity: { person1: { pia: 3000, claimAge: 67, alreadyClaiming: false } },
    options: { withdrawalStrategy: "default-tax-aware", bracketAdjustForInflation: true, rothConversionRule: { enabled: false, fillToBracket: "24", startAge: 60, endAge: 74 }, monteCarlo: { simulations: 200 } },
    safeSpend: { method, mcThreshold: 0.9 },
    targetAnnualSpend: 120_000,
  };
}

function withIra(plan: Plan, contrib: number): Plan {
  return {
    ...plan,
    assets: plan.assets.map((a) =>
      a.id === "ira" && a.category === "trad-ira" ? { ...a, annualContribution: contrib } : a,
    ),
  };
}

describe("invariants: contribution monotonicity", () => {
  test("drain-zero: more savings → more safe spend, never less", () => {
    const safes = [0, 2000, 4000, 6000, 8000].map((c) =>
      computeSafeSpend(withIra(basePlan("drain-zero"), c)).safeSpendToday,
    );
    for (let i = 1; i < safes.length; i++) {
      expect(safes[i]).toBeGreaterThanOrEqual(safes[i - 1] - 100); // tolerate $100 bisection noise
    }
  });

  test("drain-zero: more savings → required gap monotonically decreases", () => {
    const reqs = [0, 4000, 8000].map((c) => {
      const p = withIra(basePlan("drain-zero"), c);
      const safe = computeSafeSpend(p);
      return computeSavingsGap({ plan: p, safe, goalToday: 120_000 }).requiredAnnualContribution;
    });
    expect(reqs[1]).toBeLessThanOrEqual(reqs[0]);
    expect(reqs[2]).toBeLessThanOrEqual(reqs[1]);
  });

  test("4pct: more savings → required gap monotonically decreases", () => {
    const reqs = [0, 4000, 8000].map((c) => {
      const p = withIra(basePlan("4pct"), c);
      const safe = computeSafeSpend(p);
      return computeSavingsGap({ plan: p, safe, goalToday: 120_000 }).requiredAnnualContribution;
    });
    expect(reqs[1]).toBeLessThanOrEqual(reqs[0]);
    expect(reqs[2]).toBeLessThanOrEqual(reqs[1]);
  });
});

describe("invariants: method semantics", () => {
  test("4pct gap > drain-zero gap (conservative method needs more savings)", () => {
    const goal = 120_000;
    const planDrain = basePlan("drain-zero");
    const plan4 = basePlan("4pct");
    const safeDrain = computeSafeSpend(planDrain);
    const safe4 = computeSafeSpend(plan4);
    const gapDrain = computeSavingsGap({ plan: planDrain, safe: safeDrain, goalToday: goal });
    const gap4 = computeSavingsGap({ plan: plan4, safe: safe4, goalToday: goal });
    expect(gap4.requiredAnnualContribution).toBeGreaterThan(gapDrain.requiredAnnualContribution);
  });

  test("4pct safe spend < drain-zero safe spend (4% leaves residual estate)", () => {
    const planDrain = basePlan("drain-zero");
    const plan4 = basePlan("4pct");
    const safeDrain = computeSafeSpend(planDrain);
    const safe4 = computeSafeSpend(plan4);
    expect(safe4.safeSpendToday).toBeLessThan(safeDrain.safeSpendToday);
  });
});

describe("invariants: zero-balance return fallback (the trad-IRA 7% bug)", () => {
  test("a $0 trad-IRA's tier drives the displayed traditional return, not 7%", () => {
    const plan: Plan = {
      ...basePlan(),
      assets: [
        { id: "ira", owner: "p1", category: "trad-ira", balance: 0, annualContribution: 7000, tier: { tier: "income-growth" } },
      ],
    };
    const r = effectiveReturns(plan);
    expect(r.traditional).not.toBeNull();
    // income-growth = 5.96%. Bug would have shown 0.07.
    expect(r.traditional).toBeCloseTo(0.0596, 4);
  });

  test("retirementTier on a $0 trad-IRA is honored", () => {
    const plan: Plan = {
      ...basePlan(),
      assets: [
        {
          id: "ira",
          owner: "p1",
          category: "trad-ira",
          balance: 0,
          annualContribution: 7000,
          tier: { tier: "growth" },
          retirementTier: { tier: "income-growth" },
        },
      ],
    };
    const r = effectiveReturns(plan);
    // Display uses post-ret tier (5.96%), not the working-years 12.49%.
    expect(r.traditional).toBeCloseTo(0.0596, 4);
  });
});

describe("invariants: post-retirement tier flows into projection", () => {
  test("changing retirement-tier moves drain-zero safe spend", () => {
    const planLow: Plan = {
      ...basePlan(),
      assets: basePlan().assets.map((a) =>
        a.category === "real-estate" || a.category === "other"
          ? a
          : { ...a, retirementTier: { tier: "income-growth" } },
      ),
    };
    const planHigh: Plan = {
      ...basePlan(),
      assets: basePlan().assets.map((a) =>
        a.category === "real-estate" || a.category === "other"
          ? a
          : { ...a, retirementTier: { tier: "growth" } },
      ),
    };
    const safeLow = computeSafeSpend(planLow);
    const safeHigh = computeSafeSpend(planHigh);
    expect(safeHigh.safeSpendToday).toBeGreaterThan(safeLow.safeSpendToday);
  });
});

describe("invariants: split-retirement bug fix still holds", () => {
  test("p2 retiring 5 years later: p2's investable balance does not double-count growth", () => {
    const plan: Plan = {
      ...basePlan(),
      profile: {
        ...basePlan().profile,
        mode: "couple",
        filingStatus: "mfj",
        person2: { birthYear: 1981, retirementAge: 70, currentSalary: 50_000, salaryGrowth: 0.03, longevityAge: 95 },
      },
      assets: [
        { id: "p2bro", owner: "p2", category: "brokerage", balance: 100_000, monthlyContribution: 0, costBasis: 100_000, tier: { tier: "growth-income" } },
      ],
    };
    const r = accumulateToRetirement(plan);
    // 20-year compounding (cutoff = min p1=20, p2=25), not 25 years.
    const expected20 = 100_000 * Math.pow(1 + 0.0962 / 12, 12 * 20);
    expect(r.balanceByAsset["p2bro"]).toBeCloseTo(expected20, -1);
  });
});

describe("invariants: drain-zero shortfall noise tolerance", () => {
  test("safe spend monotonic in portfolio (no FP-noise inversion)", () => {
    const sizes = [50_000, 200_000, 500_000, 1_000_000];
    const safes = sizes.map((bal) => {
      const p: Plan = {
        ...basePlan(),
        assets: [
          { id: "ira", owner: "p1", category: "trad-ira", balance: bal, annualContribution: 0, tier: { tier: "balanced" } },
        ],
      };
      return computeSafeSpend(p).safeSpendToday;
    });
    for (let i = 1; i < safes.length; i++) {
      expect(safes[i]).toBeGreaterThanOrEqual(safes[i - 1]);
    }
  });
});

describe("invariants: projection responds to inputs", () => {
  test("higher salary → higher pre-retirement contributions → bigger portfolio at retirement", () => {
    const planLow: Plan = { ...basePlan(), profile: { ...basePlan().profile, person1: { ...basePlan().profile.person1, currentSalary: 50_000 } } };
    const planHigh: Plan = { ...basePlan(), profile: { ...basePlan().profile, person1: { ...basePlan().profile.person1, currentSalary: 200_000 } } };
    const accumLow = accumulateToRetirement(planLow);
    const accumHigh = accumulateToRetirement(planHigh);
    expect(accumHigh.balanceByAsset["k"]).toBeGreaterThan(accumLow.balanceByAsset["k"]);
  });

  test("higher inflation → higher nominal expenses across the projection", () => {
    const planLow: Plan = { ...basePlan(), profile: { ...basePlan().profile, inflation: 0.02 } };
    const planHigh: Plan = { ...basePlan(), profile: { ...basePlan().profile, inflation: 0.05 } };
    const rowsLow = projectPlan(planLow);
    const rowsHigh = projectPlan(planHigh);
    expect(rowsHigh[rowsHigh.length - 1].expensesTotal).toBeGreaterThan(rowsLow[rowsLow.length - 1].expensesTotal);
  });
});
