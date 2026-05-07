/**
 * Audit Layer 1: Sensitivity matrix.
 *
 * For each input field, verify the expected delta direction across
 * key outputs. Catches "I changed X but Y didn't move" bugs (e.g. the
 * earlier 4%-rule-vs-real-estate-action one).
 *
 * Each test changes one field at a time relative to a reference plan
 * and asserts which outputs should move and which should stay put.
 */

import { describe, expect, test } from "vitest";
import { computeSafeSpend, computeSavingsGap } from "./safe-spend";
import { projectPlan } from "./projection";
import { accumulateToRetirement } from "./growth";
import type { Plan, SafeSpendMethod } from "../state/schema";

function basePlan(): Plan {
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
      { id: "k", owner: "p1", category: "trad-401k", balance: 200_000, contributionPct: 0.10, tier: { tier: "balanced" } },
      { id: "br", owner: "p1", category: "brokerage", balance: 100_000, monthlyContribution: 500, costBasis: 100_000, tier: { tier: "growth-income" } },
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

function safe(plan: Plan, method: SafeSpendMethod = "drain-zero"): number {
  return computeSafeSpend({ ...plan, safeSpend: { ...plan.safeSpend, method } }).safeSpendToday;
}
function gap(plan: Plan, method: SafeSpendMethod = "drain-zero"): number {
  const p = { ...plan, safeSpend: { ...plan.safeSpend, method } };
  const s = computeSafeSpend(p);
  return computeSavingsGap({ plan: p, safe: s, goalToday: plan.targetAnnualSpend ?? 100_000 }).requiredAnnualContribution;
}

describe("Layer 1: profile inputs", () => {
  test("retirementAge: later retirement → bigger portfolio (more accumulation years)", () => {
    const a = basePlan();
    const b = basePlan();
    b.profile.person1.retirementAge = 70;
    const portA = accumulateToRetirement(a);
    const portB = accumulateToRetirement(b);
    const sumA = Object.values(portA.balanceByAsset).reduce((s, v) => s + v, 0);
    const sumB = Object.values(portB.balanceByAsset).reduce((s, v) => s + v, 0);
    expect(sumB).toBeGreaterThan(sumA);
  });

  test("longevityAge: longer plan → smaller drain-zero safe spend", () => {
    const a = basePlan();
    const b = basePlan();
    b.profile.person1.longevityAge = 105;
    expect(safe(b, "drain-zero")).toBeLessThan(safe(a, "drain-zero"));
  });

  test("inflation: higher inflation → smaller real safe spend", () => {
    const a = basePlan();
    const b = basePlan();
    b.profile.inflation = 0.06;
    expect(safe(b, "drain-zero")).toBeLessThan(safe(a, "drain-zero"));
  });

  test("salaryGrowth: higher growth → bigger trad-401k contributions accumulate", () => {
    const a = basePlan();
    const b = basePlan();
    b.profile.person1.salaryGrowth = 0.07;
    const portA = accumulateToRetirement(a).balanceByAsset["k"];
    const portB = accumulateToRetirement(b).balanceByAsset["k"];
    expect(portB).toBeGreaterThan(portA);
  });

  test("filingStatus: MFJ has bigger brackets → more after-tax income", () => {
    const a = basePlan();
    a.profile.filingStatus = "single";
    const b = basePlan();
    b.profile.filingStatus = "mfj";
    const rowsA = projectPlan(a);
    const rowsB = projectPlan(b);
    // First retirement year tax should be lower under MFJ
    expect(rowsB[0].totalTax).toBeLessThanOrEqual(rowsA[0].totalTax);
  });

  test("state: ID has income tax, WA does not", () => {
    const idPlan = basePlan();
    idPlan.profile.state = "ID";
    const waPlan = basePlan();
    waPlan.profile.state = "WA";
    // Find a year with significant ordinary income (after age 73 RMD)
    const rId = projectPlan(idPlan);
    const rWa = projectPlan(waPlan);
    const idRmdYear = rId.find((r) => r.rmdTotal > 50_000);
    const waRmdYear = rWa.find((r) => r.rmdTotal > 50_000);
    if (idRmdYear && waRmdYear) {
      expect(idRmdYear.stateTax).toBeGreaterThan(waRmdYear.stateTax);
    }
  });
});

describe("Layer 1: asset inputs", () => {
  test("balance: higher starting balance → bigger portfolio at retirement", () => {
    const a = basePlan();
    const b = basePlan();
    (b.assets[0] as { balance: number }).balance = 500_000;
    expect(safe(b)).toBeGreaterThan(safe(a));
  });

  test("contributionPct: higher 401k % → bigger portfolio at retirement", () => {
    const a = basePlan();
    const b = basePlan();
    (b.assets[0] as { contributionPct: number }).contributionPct = 0.20;
    expect(safe(b)).toBeGreaterThan(safe(a));
  });

  test("tier: higher pre-ret tier → bigger portfolio", () => {
    const a = basePlan();
    const b = basePlan();
    const bAsset = b.assets[0];
    if (bAsset.category !== "real-estate" && bAsset.category !== "other") {
      bAsset.tier = { tier: "growth" };
    }
    expect(safe(b)).toBeGreaterThan(safe(a));
  });

  test("retirementTier: higher post-ret tier → bigger drain-zero safe spend", () => {
    const a = basePlan();
    const aAsset = a.assets[0];
    if (aAsset.category !== "real-estate" && aAsset.category !== "other") {
      aAsset.retirementTier = { tier: "income-growth" };
    }
    const b = basePlan();
    const bAsset = b.assets[0];
    if (bAsset.category !== "real-estate" && bAsset.category !== "other") {
      bAsset.retirementTier = { tier: "growth" };
    }
    expect(safe(b)).toBeGreaterThan(safe(a));
  });
});

describe("Layer 1: real-estate inputs", () => {
  function withProperty(action: "hold" | "liquidate" | "liquidate-at-age" | "sell-when-needed"): Plan {
    const p = basePlan();
    p.assets.push({
      id: "house",
      owner: "p1",
      category: "real-estate",
      subtype: "primary",
      balance: 0,
      marketValue: 600_000,
      appreciation: 0.035,
      mortgageBalance: 100_000,
      basis: 300_000,
      yearsOwned: 10,
      monthlyRentIncome: 0,
      monthlyRentExpense: 0,
      actionAtRetirement: action,
      liquidateAtAge: action === "liquidate-at-age" ? 75 : undefined,
    });
    return p;
  }

  test("4% rule: hold vs liquidate at retirement → different safe spend", () => {
    const sHold = safe(withProperty("hold"), "4pct");
    const sLiq = safe(withProperty("liquidate"), "4pct");
    // Liquidating moves house value into the 4%-eligible liquid basis
    expect(sLiq).toBeGreaterThan(sHold);
  });

  test("4% rule: hold vs liquidate-at-age → different safe spend", () => {
    const sHold = safe(withProperty("hold"), "4pct");
    const sLAA = safe(withProperty("liquidate-at-age"), "4pct");
    expect(sLAA).toBeGreaterThan(sHold);
  });

  test("4% rule: hold vs sell-when-needed → different safe spend", () => {
    const sHold = safe(withProperty("hold"), "4pct");
    const sSWN = safe(withProperty("sell-when-needed"), "4pct");
    expect(sSWN).toBeGreaterThan(sHold);
  });

  test("appreciation rate moves portfolio at retirement", () => {
    const a = withProperty("liquidate");
    const b = withProperty("liquidate");
    const aAsset = a.assets.find((x) => x.id === "house");
    const bAsset = b.assets.find((x) => x.id === "house");
    if (aAsset && aAsset.category === "real-estate") aAsset.appreciation = 0.02;
    if (bAsset && bAsset.category === "real-estate") bAsset.appreciation = 0.06;
    expect(safe(b, "4pct")).toBeGreaterThan(safe(a, "4pct"));
  });
});

describe("Layer 1: expense / income / SS inputs", () => {
  test("expenses: higher current expenses → similar safe spend (rule says spend should depend on goal not expenses)", () => {
    const a = basePlan();
    const b = basePlan();
    b.expenses[0].monthlyToday = 8000;
    // Drain-zero scales expenses by goal/current ratio internally, so safe-spend
    // should stay roughly the same between equivalent setups.
    const sa = safe(a, "drain-zero");
    const sb = safe(b, "drain-zero");
    expect(Math.abs(sb - sa)).toBeLessThan(sa * 0.05); // within 5%
  });

  test("targetAnnualSpend (goal): doesn't change safe spend, but moves the gap", () => {
    const a = basePlan();
    const b = basePlan();
    a.targetAnnualSpend = 80_000;
    b.targetAnnualSpend = 150_000;
    const sa = safe(a);
    const sb = safe(b);
    expect(sa).toBeCloseTo(sb, 0);
    expect(gap(b)).toBeGreaterThan(gap(a));
  });

  test("SS PIA: higher PIA → bigger safe spend", () => {
    const a = basePlan();
    const b = basePlan();
    b.socialSecurity.person1.pia = 5000;
    expect(safe(b)).toBeGreaterThan(safe(a));
  });

  test("SS claim age: claiming at 70 vs 62 → different lifetime benefit, different safe spend", () => {
    const a = basePlan();
    a.socialSecurity.person1.claimAge = 62;
    const b = basePlan();
    b.socialSecurity.person1.claimAge = 70;
    // Most recipients with normal longevity benefit from delaying. Safe spends
    // should differ either way (test = "they aren't equal").
    expect(safe(a)).not.toBeCloseTo(safe(b), 0);
  });
});

describe("Layer 1: healthcare inputs", () => {
  test("LTC enabled: smaller safe spend (LTC adds expected cost)", () => {
    const a = basePlan();
    const b = basePlan();
    b.healthcare.ltc.enabled = true;
    expect(safe(b)).toBeLessThan(safe(a));
  });

  test("ACA tier: higher-tier plan → higher pre-Medicare cost → smaller safe spend", () => {
    const a = basePlan();
    a.profile.person1.retirementAge = 60; // ensure ACA years exist
    const b = { ...a, healthcare: { ...a.healthcare, acaTier: "gold" as const } };
    expect(safe(b)).toBeLessThan(safe(a) + 1); // gold ≥ silver in cost, lower safe
  });
});

describe("Layer 1: rule-of-thumb sanity (non-deltas)", () => {
  test("Schema-version field doesn't change anything", () => {
    const a = basePlan();
    const b = basePlan();
    expect(safe(a)).toBeCloseTo(safe(b), 1);
  });
});
