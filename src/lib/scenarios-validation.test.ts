/**
 * End-to-end scenario validation. These tests build realistic plans, run the engine,
 * and assert ranges around hand-computed expectations. Failures indicate engine drift.
 */

import { describe, expect, test } from "vitest";
import { accumulateToRetirement } from "./growth";
import { projectPlan } from "./projection";
import { computeSafeSpend, computeSavingsGap } from "./safe-spend";
import type { Plan } from "../state/schema";

function basePlan(): Plan {
  return {
    schemaVersion: 1,
    profile: {
      mode: "single",
      person1: {
        birthYear: 1981, // age 45 in 2026
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
    expenses: [
      {
        id: "e1",
        label: "Living",
        monthlyToday: 4000,
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
      person1: { pia: 3000, claimAge: 67, alreadyClaiming: false },
    },
    options: {
      withdrawalStrategy: "default-tax-aware",
      bracketAdjustForInflation: true,
      rothConversionRule: { enabled: false, fillToBracket: "24", startAge: 60, endAge: 74 },
      monteCarlo: { simulations: 200 },
    },
    safeSpend: { method: "drain-zero", mcThreshold: 0.9 },
  };
}

describe("Scenario A: single 45yo, mid-income, mixed accounts", () => {
  function planA(): Plan {
    const p = basePlan();
    p.assets = [
      {
        id: "k1",
        owner: "p1",
        category: "trad-401k",
        balance: 200_000,
        contributionPct: 0.10,
        employerMatchPct: 0.04,
        tier: { tier: "growth-income" }, // 9.62%
      },
      {
        id: "b1",
        owner: "p1",
        category: "brokerage",
        balance: 100_000,
        monthlyContribution: 500,
        costBasis: 100_000,
        tier: { tier: "balanced" }, // 8.12%
      },
      {
        id: "r1",
        owner: "p1",
        category: "roth-ira",
        balance: 50_000,
        annualContribution: 7000,
        tier: { tier: "growth" }, // 10.62%
      },
    ];
    p.targetAnnualSpend = 60_000;
    return p;
  }

  test("trad-401k accumulation matches FV-of-growing-annuity within 5%", () => {
    const p = planA();
    const r = accumulateToRetirement(p);
    // Hand math: 200k × (1+.0962/12)^240 ≈ 200k × 6.79 = $1.358M
    // Plus growing-annuity contribs: ~$957k → ~$2.31M
    const k1 = r.balanceByAsset["k1"];
    expect(k1).toBeGreaterThan(2_100_000);
    expect(k1).toBeLessThan(2_500_000);
  });

  test("brokerage matches FV with $6k/yr constant (monthly compounding)", () => {
    const p = planA();
    const r = accumulateToRetirement(p);
    const b1 = r.balanceByAsset["b1"];
    // Monthly-compounded:
    // 100k × (1+.0812/12)^240 ≈ $504k
    // $500/mo × FV-factor(.0812/12, 240) ≈ $299k
    // Total ≈ $803k.
    expect(b1).toBeGreaterThan(750_000);
    expect(b1).toBeLessThan(850_000);
  });

  test("roth-ira hits ~$1.2M (growth tier = 12.49%)", () => {
    const p = planA();
    const r = accumulateToRetirement(p);
    const r1 = r.balanceByAsset["r1"];
    // 50k × (1+.1249/12)^240 ≈ $600k
    // 7k/yr FV ≈ $616k
    // Total ≈ $1.22M.
    expect(r1).toBeGreaterThan(1_100_000);
    expect(r1).toBeLessThan(1_350_000);
  });

  test("projection produces 31 rows (2046..2076 inclusive, age 65 to 95)", () => {
    const p = planA();
    const rows = projectPlan(p);
    expect(rows.length).toBe(31);
    expect(rows[0].year).toBe(2046);
    expect(rows[0].p1Age).toBe(65);
    expect(rows[rows.length - 1].p1Age).toBe(95);
  });

  test("retirement-year SS = 0 (claim at 67, retire at 65)", () => {
    const p = planA();
    const rows = projectPlan(p);
    // SS not yet claimed in retire year (age 65 < 67)
    expect(rows[0].ssP1).toBe(0);
    // SS active by 2048 (age 67)
    expect(rows[2].ssP1).toBeGreaterThan(0);
  });

  test("safe spend (drain-zero) > expected — generous portfolio", () => {
    const p = planA();
    const safe = computeSafeSpend(p);
    // With $3M+ portfolio, safe base spend should comfortably exceed current $48k
    expect(safe.safeSpendToday).toBeGreaterThan(60_000);
  });

  test("savings gap is zero when goal is on track", () => {
    const p = planA();
    const safe = computeSafeSpend(p);
    if (safe.safeSpendToday >= 60_000) {
      const gap = computeSavingsGap({ plan: p, safe, goalToday: 60_000 });
      expect(gap.requiredAnnualContribution).toBe(0);
    }
  });
});

describe("Scenario B: couple, split retirement (regression for double-growth bug)", () => {
  function planB(): Plan {
    const p = basePlan();
    p.profile.mode = "couple";
    p.profile.filingStatus = "mfj";
    p.profile.person2 = {
      birthYear: 1981,
      retirementAge: 70,
      currentSalary: 80_000,
      salaryGrowth: 0.03,
      longevityAge: 95,
    };
    p.socialSecurity.person2 = { pia: 2000, claimAge: 67, alreadyClaiming: false };
    p.assets = [
      {
        id: "p1k",
        owner: "p1",
        category: "trad-401k",
        balance: 300_000,
        contributionPct: 0.10,
        tier: { tier: "growth-income" },
      },
      {
        id: "p2k",
        owner: "p2",
        category: "trad-401k",
        balance: 200_000,
        contributionPct: 0.10,
        tier: { tier: "growth-income" },
      },
    ];
    return p;
  }

  test("p1 and p2 401k accumulate to projection start (year 2046, p1 retires)", () => {
    const p = planB();
    const accum = accumulateToRetirement(p);
    // cutoff = min(20, 25) = 20 yrs. Both should compound 20 yrs only.
    // p2's 401k must NOT contain 25 years of growth.
    const p2k = accum.balanceByAsset["p2k"];
    // 200k @ 9.62% × 20yrs ≈ $1.36M, plus contribs (10% of $80k * 1.03^t) FV ≈ ~$546k
    // total ≈ ~$1.9M. If bug: would compound 25 yrs → ~$2.9M+
    expect(p2k).toBeLessThan(2_300_000);
    expect(p2k).toBeGreaterThan(1_500_000);
  });

  test("p2 contributions credit during overlap (years 2046-2050)", () => {
    const p = planB();
    const rows = projectPlan(p);
    // Year 0 (2046): p2 still working, balance is accum + first overlap contrib.
    // By year 5 (2051, p2 just retired), the trad bucket should reflect 5 yrs of overlap contribs + growth.
    // Sanity: trad balance at year 5 > balance at year 0 (because of contribs + growth).
    expect(rows[5].traditionalBalance).toBeGreaterThan(rows[0].traditionalBalance);
  });

  test("trad-401k overlap contributions reduce taxable wages (lower fed tax)", () => {
    const p = planB();
    const rows = projectPlan(p);
    // During overlap (year 0..4), p2 still earns $80k+ and contributes 10% to trad.
    // Compare against a plan with no contribution to verify tax is lower.
    const noContribPlan = planB();
    const p2kAsset = noContribPlan.assets.find((a) => a.id === "p2k");
    if (p2kAsset && p2kAsset.category === "trad-401k") {
      p2kAsset.contributionPct = 0;
    }
    const noContribRows = projectPlan(noContribPlan);
    // Tax in year 0 (overlap) should be LOWER with contribution (more deductible).
    expect(rows[0].federalTax).toBeLessThanOrEqual(noContribRows[0].federalTax);
  });
});

describe("Scenario C: real estate sell-when-needed", () => {
  function planC(): Plan {
    const p = basePlan();
    p.assets = [
      {
        id: "k",
        owner: "p1",
        category: "trad-401k",
        balance: 100_000,
        contributionPct: 0.05,
        tier: { tier: "balanced" },
      },
      {
        id: "rental",
        owner: "p1",
        category: "real-estate",
        subtype: "rental",
        balance: 0,
        marketValue: 300_000,
        appreciation: 0.035,
        mortgageBalance: 0,
        basis: 200_000,
        yearsOwned: 5,
        monthlyRentIncome: 0,
        monthlyRentExpense: 0,
        actionAtRetirement: "sell-when-needed",
      },
    ];
    // High expenses so portfolio drains and triggers a sell.
    p.expenses[0].monthlyToday = 6000;
    return p;
  }

  test("rental sells when portfolio shortfalls", () => {
    const p = planC();
    const rows = projectPlan(p);
    // Rental should liquidate at some point. realEstateValue should drop to 0.
    const lastRE = rows[rows.length - 1].realEstateValue;
    expect(lastRE).toBe(0);
  });
});

describe("Scenario D: edge — early retirement at 50", () => {
  function planD(): Plan {
    const p = basePlan();
    p.profile.person1.retirementAge = 50;
    p.assets = [
      {
        id: "b",
        owner: "p1",
        category: "brokerage",
        balance: 1_500_000,
        monthlyContribution: 0,
        costBasis: 1_500_000,
        tier: { tier: "balanced" },
      },
    ];
    return p;
  }

  test("retires at 50, projection runs 46 years", () => {
    const p = planD();
    const rows = projectPlan(p);
    expect(rows[0].p1Age).toBe(50);
    expect(rows.length).toBe(46); // 50..95 inclusive
  });

  test("ACA cost present pre-Medicare (under 65)", () => {
    const p = planD();
    const rows = projectPlan(p);
    // Year 0 (age 50): pre-Medicare → ACA cost > 0
    expect(rows[0].acaCost).toBeGreaterThan(0);
    expect(rows[0].medicareCost).toBe(0);
    // Year 15 (age 65): Medicare kicks in
    expect(rows[15].medicareCost).toBeGreaterThan(0);
  });
});

describe("Scenario E: high-income two-spouse with all account types", () => {
  function planE(): Plan {
    const p = basePlan();
    p.profile.mode = "couple";
    p.profile.filingStatus = "mfj";
    p.profile.state = "ID";
    p.profile.person1.currentSalary = 200_000;
    p.profile.person2 = {
      birthYear: 1979,
      retirementAge: 65,
      currentSalary: 150_000,
      salaryGrowth: 0.03,
      longevityAge: 95,
    };
    p.socialSecurity.person2 = { pia: 3500, claimAge: 67, alreadyClaiming: false };
    p.assets = [
      {
        id: "p1k",
        owner: "p1",
        category: "trad-401k",
        balance: 500_000,
        contributionPct: 0.15,
        employerMatchPct: 0.05,
        tier: { tier: "growth" },
      },
      {
        id: "p2k",
        owner: "p2",
        category: "roth-401k",
        balance: 400_000,
        contributionPct: 0.15,
        tier: { tier: "growth" },
      },
      {
        id: "hsa",
        owner: "p1",
        category: "hsa",
        balance: 30_000,
        annualContribution: 8000,
        tier: { tier: "balanced" },
      },
      {
        id: "br",
        owner: "joint",
        category: "brokerage",
        balance: 200_000,
        monthlyContribution: 1000,
        costBasis: 200_000,
        tier: { tier: "growth-income" },
      },
      {
        id: "house",
        owner: "joint",
        category: "real-estate",
        subtype: "primary",
        balance: 0,
        marketValue: 800_000,
        appreciation: 0.035,
        mortgageBalance: 200_000,
        basis: 400_000,
        yearsOwned: 10,
        monthlyRentIncome: 0,
        monthlyRentExpense: 0,
        actionAtRetirement: "hold",
      },
    ];
    p.expenses[0].monthlyToday = 8000;
    p.targetAnnualSpend = 100_000;
    return p;
  }

  test("plan accumulates and projects without errors", () => {
    const p = planE();
    const accum = accumulateToRetirement(p);
    expect(accum.balanceByAsset["p1k"]).toBeGreaterThan(0);
    const rows = projectPlan(p);
    expect(rows.length).toBeGreaterThan(0);
  });

  test("Idaho state tax > 0 in retirement year (sourced income)", () => {
    const p = planE();
    const rows = projectPlan(p);
    // ID has income tax. Some year should have state tax.
    const anyStateTax = rows.some((r) => r.stateTax > 0);
    expect(anyStateTax).toBe(true);
  });

  test("safe spend reflects 4% rule reasonably", () => {
    const p = planE();
    const drainPlan = { ...p, safeSpend: { ...p.safeSpend, method: "drain-zero" as const } };
    const fourPctPlan = { ...p, safeSpend: { ...p.safeSpend, method: "4pct" as const } };
    const drain = computeSafeSpend(drainPlan);
    const fourPct = computeSafeSpend(fourPctPlan);
    // Both should be positive and within an order of magnitude of each other.
    expect(drain.safeSpendToday).toBeGreaterThan(0);
    expect(fourPct.safeSpendToday).toBeGreaterThan(0);
    // Drain-zero spends all portfolio + growth → typically much higher than naive 4%
    // (which assumes worst-sequence survival). Ratio commonly 2-5×.
    const ratio = drain.safeSpendToday / fourPct.safeSpendToday;
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(8.0);
  });
});
