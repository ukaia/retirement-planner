import { describe, expect, test } from "vitest";
import { computeSafeSpend, computeSavingsGap } from "./safe-spend";
import { runMonteCarlo } from "./monte-carlo";
import type { Plan } from "../state/schema";

/**
 * Regression: previously, MC counted a sim as "depleted" whenever any year
 * had `r.shortfall > 0`, including the tiny float-precision residual that
 * the withdrawal gross-up loop occasionally leaves behind ($0.40 ish).
 * That artificially capped MC success rate even with a $1B+ portfolio,
 * which made the savings-gap bisection return Infinity ("Goal isn't
 * reachable") for plans where any reasonable extra contribution would
 * have actually fixed the gap. monte-carlo.ts now uses a noise floor
 * matching drain-zero's, so this case must converge to a finite answer.
 */
function probePlan(): Plan {
  return {
    schemaVersion: 1,
    profile: {
      mode: "single",
      person1: {
        birthYear: 1968,
        retirementAge: 65,
        currentSalary: 0,
        salaryGrowth: 0.03,
        longevityAge: 90,
      },
      filingStatus: "single",
      state: "AK",
      taxYear: 2026,
      inflation: 0.03,
      dependents: 0,
    },
    assets: [
      {
        id: "ira",
        owner: "p1",
        category: "trad-ira",
        balance: 1_500_000,
        annualContribution: 7_000,
        tier: { tier: "aggressive-growth" },
        retirementTier: { tier: "income-growth" },
      },
      {
        id: "brk",
        owner: "p1",
        category: "brokerage",
        balance: 50_000,
        monthlyContribution: 0,
        costBasis: 50_000,
        tier: { tier: "aggressive-growth" },
        retirementTier: { tier: "income-growth" },
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
        enabled: true,
        probability: 0.5,
        annualCost: 100_000,
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
    safeSpend: {
      method: "monte-carlo",
      mcThreshold: 0.9,
      extraContribAssetId: "brk",
    },
    targetAnnualSpend: 240_000,
  };
}

describe("MC noise-floor regression: savings gap stays finite when sufficient", () => {
  test("MC at $100M/yr extra contributions for 7 years should clear ≥90% success", () => {
    const plan: Plan = {
      ...probePlan(),
      assets: probePlan().assets.map((a) =>
        a.id === "brk" && a.category === "brokerage"
          ? { ...a, monthlyContribution: 100_000_000 / 12 }
          : a,
      ),
      expenses: probePlan().expenses.map((e) => ({
        ...e,
        monthlyToday: e.monthlyToday * (240_000 / 60_000),
      })),
    };
    const mc = runMonteCarlo({ plan, simulations: 200, seed: 0xc0ffee });
    expect(mc.successRate).toBeGreaterThan(0.95);
  });

  test("computeSavingsGap (MC, preferMcAccurate) returns a finite contribution for the realistic case", () => {
    const plan = probePlan();
    const safe = computeSafeSpend(plan);
    const gap = computeSavingsGap({
      plan,
      safe,
      goalToday: 240_000,
      preferMcAccurate: true,
    });
    expect(Number.isFinite(gap.requiredAnnualContribution)).toBe(true);
  }, 60_000);
});
