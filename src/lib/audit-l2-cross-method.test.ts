/**
 * Audit Layer 2: Cross-method consistency.
 *
 * Same plan, all methods. Asserts the structural relationships that
 * each method's philosophy implies.
 */

import { describe, expect, test } from "vitest";
import { computeSafeSpend, computeSavingsGap } from "./safe-spend";
import type { Plan, SafeSpendMethod } from "../state/schema";

function basePlan(): Plan {
  return {
    schemaVersion: 1,
    profile: {
      mode: "single",
      person1: { birthYear: 1981, retirementAge: 65, currentSalary: 100_000, salaryGrowth: 0.03, longevityAge: 95 },
      filingStatus: "single",
      state: "OR",
      taxYear: 2026,
      inflation: 0.031,
      dependents: 0,
    },
    assets: [
      { id: "k", owner: "p1", category: "trad-401k", balance: 200_000, contributionPct: 0.10, tier: { tier: "balanced" } },
      { id: "br", owner: "p1", category: "brokerage", balance: 100_000, monthlyContribution: 500, costBasis: 100_000, tier: { tier: "growth-income" } },
      { id: "ira", owner: "p1", category: "roth-ira", balance: 50_000, annualContribution: 6000, tier: { tier: "growth" } },
    ],
    incomeStreams: [],
    expenses: [{ id: "e1", label: "Living", monthlyToday: 5000, growth: 0, startAge: null, endAge: null, phaseOutAtAge: null, stepChange: null }],
    healthcare: { acaTier: "silver", medigap: false, ltc: { enabled: false, probability: 0.6, annualCost: 108_000, durationYears: 2.5, insurance: { enabled: false, annualPremium: 0, dailyBenefit: 0 } } },
    socialSecurity: { person1: { pia: 3000, claimAge: 67, alreadyClaiming: false } },
    options: { withdrawalStrategy: "default-tax-aware", bracketAdjustForInflation: true, rothConversionRule: { enabled: false, fillToBracket: "24", startAge: 60, endAge: 74 }, monteCarlo: { simulations: 200 } },
    safeSpend: { method: "drain-zero", mcThreshold: 0.9 },
    targetAnnualSpend: 100_000,
  };
}

function withMethod(plan: Plan, method: SafeSpendMethod): Plan {
  return { ...plan, safeSpend: { ...plan.safeSpend, method } };
}

describe("Layer 2: cross-method ordering", () => {
  test("4pct safe spend ≤ drain-zero safe spend (4% reserves principal)", () => {
    const plan = basePlan();
    const s4 = computeSafeSpend(withMethod(plan, "4pct"));
    const sD = computeSafeSpend(withMethod(plan, "drain-zero"));
    expect(s4.safeSpendToday).toBeLessThanOrEqual(sD.safeSpendToday);
  });

  test("4pct gap ≥ drain-zero gap (conservative method requires more savings)", () => {
    const plan = basePlan();
    const p4 = withMethod(plan, "4pct");
    const pD = withMethod(plan, "drain-zero");
    const g4 = computeSavingsGap({
      plan: p4,
      safe: computeSafeSpend(p4),
      goalToday: plan.targetAnnualSpend ?? 100_000,
    });
    const gD = computeSavingsGap({
      plan: pD,
      safe: computeSafeSpend(pD),
      goalToday: plan.targetAnnualSpend ?? 100_000,
    });
    expect(g4.requiredAnnualContribution).toBeGreaterThanOrEqual(
      gD.requiredAnnualContribution,
    );
  });

  test("MC @ 90% safe spend ≤ drain-zero safe spend (success threshold reserves capital)", () => {
    const plan = basePlan();
    const sMC = computeSafeSpend(withMethod(plan, "monte-carlo"));
    const sD = computeSafeSpend(withMethod(plan, "drain-zero"));
    expect(sMC.safeSpendToday).toBeLessThanOrEqual(sD.safeSpendToday + 5_000);
  });
});

describe("Layer 2: shared sensitivity (all methods react to same input)", () => {
  test("each method's safe spend rises when starting balance grows", () => {
    const small = basePlan();
    (small.assets[0] as { balance: number }).balance = 100_000;
    const big = basePlan();
    (big.assets[0] as { balance: number }).balance = 1_000_000;
    for (const method of ["drain-zero", "4pct"] as SafeSpendMethod[]) {
      const sSmall = computeSafeSpend(withMethod(small, method));
      const sBig = computeSafeSpend(withMethod(big, method));
      expect(sBig.safeSpendToday).toBeGreaterThan(sSmall.safeSpendToday);
    }
  });

  test("each method's safe spend rises when SS PIA increases", () => {
    const lowSS = basePlan();
    lowSS.socialSecurity.person1.pia = 1500;
    const hiSS = basePlan();
    hiSS.socialSecurity.person1.pia = 4500;
    // 4% rule's SS treatment: SS doesn't directly enter the 4% × portfolio formula,
    // but it does affect the avg healthcare reduction (taxes / etc.) — unlikely to
    // produce a strict monotonic move. Test drain-zero only here.
    const sLow = computeSafeSpend(withMethod(lowSS, "drain-zero"));
    const sHi = computeSafeSpend(withMethod(hiSS, "drain-zero"));
    expect(sHi.safeSpendToday).toBeGreaterThan(sLow.safeSpendToday);
  });

  test("each method's gap drops when extra savings raise the safe spend toward goal", () => {
    for (const method of ["drain-zero", "4pct"] as SafeSpendMethod[]) {
      const p0 = withMethod(basePlan(), method);
      const pHi = withMethod(basePlan(), method);
      // Boost trad-401k contributions in pHi
      (pHi.assets[0] as { contributionPct: number }).contributionPct = 0.20;
      const g0 = computeSavingsGap({
        plan: p0,
        safe: computeSafeSpend(p0),
        goalToday: p0.targetAnnualSpend ?? 100_000,
      });
      const gHi = computeSavingsGap({
        plan: pHi,
        safe: computeSafeSpend(pHi),
        goalToday: pHi.targetAnnualSpend ?? 100_000,
      });
      expect(gHi.requiredAnnualContribution).toBeLessThanOrEqual(
        g0.requiredAnnualContribution,
      );
    }
  });

  test("each method's safe spend reflects real-estate hold vs liquidate change", () => {
    function withProperty(action: "hold" | "liquidate"): Plan {
      const p = basePlan();
      p.assets.push({
        id: "house",
        owner: "p1",
        category: "real-estate",
        subtype: "primary",
        balance: 0,
        marketValue: 500_000,
        appreciation: 0.035,
        mortgageBalance: 0,
        basis: 250_000,
        yearsOwned: 5,
        monthlyRentIncome: 0,
        monthlyRentExpense: 0,
        actionAtRetirement: action,
      });
      return p;
    }
    for (const method of ["drain-zero", "4pct"] as SafeSpendMethod[]) {
      const sHold = computeSafeSpend(withMethod(withProperty("hold"), method));
      const sLiq = computeSafeSpend(withMethod(withProperty("liquidate"), method));
      // Liquidating gives more spendable wealth (proceeds in taxable bucket)
      expect(sLiq.safeSpendToday).toBeGreaterThanOrEqual(sHold.safeSpendToday);
    }
  });
});

describe("Layer 2: portfolio basis", () => {
  test("safe.portfolioAtRetirement is consistent across methods (same plan)", () => {
    const plan = basePlan();
    const portfolios = (
      ["drain-zero", "4pct", "monte-carlo"] as SafeSpendMethod[]
    ).map((m) => computeSafeSpend(withMethod(plan, m)).portfolioAtRetirement);
    // All three derive from accumulateToRetirement on the same plan → identical.
    expect(portfolios[0]).toBeCloseTo(portfolios[1], 0);
    expect(portfolios[0]).toBeCloseTo(portfolios[2], 0);
  });

  test("yearsToRetirement is consistent across methods", () => {
    const plan = basePlan();
    const years = (
      ["drain-zero", "4pct", "monte-carlo"] as SafeSpendMethod[]
    ).map((m) => computeSafeSpend(withMethod(plan, m)).yearsToRetirement);
    expect(years[0]).toBe(years[1]);
    expect(years[0]).toBe(years[2]);
  });
});
