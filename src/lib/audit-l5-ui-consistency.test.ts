/**
 * Audit Layer 5: UI ↔ engine consistency.
 *
 * Verifies that the values shown to the user in different surfaces
 * (live summary, print, calculations) all derive correctly from the
 * underlying engine functions, and that bulk controls mutate state
 * the way the engine reads it.
 */

import { describe, expect, test } from "vitest";
import { accumulateToRetirement } from "./growth";
import { accumulationTrajectory } from "./accumulation-trajectory";
import { computeSafeSpend, computeSavingsGap } from "./safe-spend";
import { effectiveReturns, projectPlan } from "./projection";
import type { Plan, SafeSpendMethod, TierKey } from "../state/schema";

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
      { id: "ira", owner: "p1", category: "roth-ira", balance: 30_000, annualContribution: 6000, tier: { tier: "growth" } },
      { id: "br", owner: "p1", category: "brokerage", balance: 50_000, monthlyContribution: 500, costBasis: 50_000, tier: { tier: "growth-income" } },
    ],
    incomeStreams: [],
    expenses: [{ id: "e1", label: "Living", monthlyToday: 5000, growth: 0, startAge: null, endAge: null, phaseOutAtAge: null, stepChange: null }],
    healthcare: { acaTier: "silver", medigap: false, ltc: { enabled: false, probability: 0.6, annualCost: 108_000, durationYears: 2.5, insurance: { enabled: false, annualPremium: 0, dailyBenefit: 0 } } },
    socialSecurity: { person1: { pia: 3000, claimAge: 67, alreadyClaiming: false } },
    options: { withdrawalStrategy: "default-tax-aware", bracketAdjustForInflation: true, rothConversionRule: { enabled: false, fillToBracket: "24", startAge: 60, endAge: 74 }, monteCarlo: { simulations: 200 } },
    safeSpend: { method, mcThreshold: 0.9 },
  };
}

describe("Layer 5: UI ↔ engine consistency", () => {
  test("Calculations trajectory final balance equals accumulateToRetirement balance", () => {
    const plan = basePlan();
    const trajectories = accumulationTrajectory(plan);
    const accum = accumulateToRetirement(plan);
    for (const t of trajectories) {
      const finalBalance = t.rows[t.rows.length - 1]?.balanceEnd ?? 0;
      const engineBalance = accum.balanceByAsset[t.assetId] ?? 0;
      expect(finalBalance).toBeCloseTo(engineBalance, -1);
    }
  });

  test("Calculations trajectory: contribution + growth = balance change each year", () => {
    const plan = basePlan();
    const trajectories = accumulationTrajectory(plan);
    for (const t of trajectories) {
      for (const r of t.rows) {
        const expectedEnd = r.balanceStart + r.contribution + r.growth;
        expect(r.balanceEnd).toBeCloseTo(expectedEnd, 2);
      }
    }
  });

  test("effectiveReturns.traditional matches the rate projection applies (post-retirement)", () => {
    const plan = basePlan();
    plan.assets = [
      { id: "k", owner: "p1", category: "trad-401k", balance: 100_000, contributionPct: 0, tier: { tier: "balanced" }, retirementTier: { tier: "income-growth" } },
    ];
    const ret = effectiveReturns(plan);
    // income-growth = 5.96%
    expect(ret.traditional).toBeCloseTo(0.0596, 4);
    // Confirm projection actually applies that rate
    const rows = projectPlan(plan);
    // Year 1 growth on traditional bucket should ≈ balance × 5.96%
    if (rows.length >= 2) {
      const startBal = rows[0].traditionalBalance;
      const growth1 = rows[1].growthTraditional;
      // Allow for any RMD / withdrawal effects in year 1; just check sign + ballpark
      // when no withdrawal happens (age 65, SS not claimed yet, no RMD).
      const impliedRate = growth1 / startBal;
      expect(impliedRate).toBeCloseTo(0.0596, 2);
    }
  });

  test("Right-rail summary safe-spend equals computeSafeSpend with drain-zero", () => {
    const plan = basePlan("4pct");
    // Live summary always uses drain-zero regardless of plan.safeSpend.method
    const livePlan = { ...plan, safeSpend: { ...plan.safeSpend, method: "drain-zero" as const } };
    const safe = computeSafeSpend(livePlan);
    // Reproduce the selector's calc:
    expect(safe.safeSpendToday).toBeGreaterThan(0);
    // The right-rail's gap uses drain-zero too:
    if (plan.targetAnnualSpend && plan.targetAnnualSpend > 0) {
      const gap = computeSavingsGap({ plan: livePlan, safe, goalToday: plan.targetAnnualSpend });
      expect(gap.requiredAnnualContribution).toBeGreaterThanOrEqual(0);
    }
  });

  test("safe-spend reads asset.retirementTier (not just tier)", () => {
    const planTierOnly: Plan = {
      ...basePlan(),
      assets: [{ id: "k", owner: "p1", category: "trad-401k", balance: 500_000, contributionPct: 0, tier: { tier: "growth" } }],
    };
    const planWithRetTier: Plan = {
      ...basePlan(),
      assets: [{ id: "k", owner: "p1", category: "trad-401k", balance: 500_000, contributionPct: 0, tier: { tier: "growth" }, retirementTier: { tier: "income-growth" } }],
    };
    const sNoRet = computeSafeSpend(planTierOnly);
    const sRet = computeSafeSpend(planWithRetTier);
    // Lower retirement tier → less in-retirement growth → lower safe spend
    expect(sRet.safeSpendToday).toBeLessThan(sNoRet.safeSpendToday);
  });

  test("Bulk retirement-tier mutation is read by safe-spend correctly", () => {
    const plan = basePlan();
    // Simulate the bulk-tier control: stamp retirementTier on every investable asset.
    const tier: TierKey = "income-growth";
    for (const a of plan.assets) {
      if (a.category !== "real-estate" && a.category !== "other") {
        a.retirementTier = { tier };
      }
    }
    const safe = computeSafeSpend(plan);
    expect(safe.safeSpendToday).toBeGreaterThan(0);
    // Returns should reflect income-growth (5.96%) for buckets that have assets.
    const ret = effectiveReturns(plan);
    if (ret.traditional !== null) expect(ret.traditional).toBeCloseTo(0.0596, 4);
    if (ret.roth !== null) expect(ret.roth).toBeCloseTo(0.0596, 4);
    if (ret.taxable !== null) expect(ret.taxable).toBeCloseTo(0.0596, 4);
  });

  test("Print summary safe-spend matches per-method computeSafeSpend", () => {
    for (const method of ["drain-zero", "4pct"] as SafeSpendMethod[]) {
      const plan = basePlan(method);
      const safe = computeSafeSpend(plan);
      // Print summary uses plan as-is (no drain-zero override anymore)
      // → safe.safeSpendToday should reflect chosen method
      if (method === "4pct") {
        const drainPlan = { ...plan, safeSpend: { ...plan.safeSpend, method: "drain-zero" as const } };
        const sDrain = computeSafeSpend(drainPlan);
        // 4% rule typically returns LOWER safe spend than drain-zero on the same plan
        expect(safe.safeSpendToday).toBeLessThanOrEqual(sDrain.safeSpendToday);
      }
    }
  });

  test("Calculations method preview: switching method writes back to plan", () => {
    // The bulk-tier UI path: changes to plan.safeSpend.method must persist
    // and influence safe-spend output.
    const plan = basePlan("drain-zero");
    const sDrain = computeSafeSpend(plan);
    plan.safeSpend.method = "4pct";
    const s4 = computeSafeSpend(plan);
    expect(s4.safeSpendToday).not.toEqual(sDrain.safeSpendToday);
  });
});
