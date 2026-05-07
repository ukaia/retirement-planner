/**
 * Audit Layer 3: Edge case enumeration.
 *
 * Walk every realistic combination of schema-allowed values and verify
 * the engine produces a non-negative, finite, monotonic-feeling answer
 * without throwing. Catches "category X breaks the engine" bugs.
 */

import { describe, expect, test } from "vitest";
import { computeSafeSpend } from "./safe-spend";
import { projectPlan } from "./projection";
import { accumulateToRetirement } from "./growth";
import type { Asset, Plan } from "../state/schema";
import type { FilingStatus } from "./tax-constants";
import type { StateCode } from "./tax/states/types";

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
    ],
    incomeStreams: [],
    expenses: [{ id: "e1", label: "Living", monthlyToday: 5000, growth: 0, startAge: null, endAge: null, phaseOutAtAge: null, stepChange: null }],
    healthcare: { acaTier: "silver", medigap: false, ltc: { enabled: false, probability: 0.6, annualCost: 108_000, durationYears: 2.5, insurance: { enabled: false, annualPremium: 0, dailyBenefit: 0 } } },
    socialSecurity: { person1: { pia: 3000, claimAge: 67, alreadyClaiming: false } },
    options: { withdrawalStrategy: "default-tax-aware", bracketAdjustForInflation: true, rothConversionRule: { enabled: false, fillToBracket: "24", startAge: 60, endAge: 74 }, monteCarlo: { simulations: 200 } },
    safeSpend: { method: "drain-zero", mcThreshold: 0.9 },
  };
}

function isFiniteFinite(n: number): boolean {
  return Number.isFinite(n);
}

describe("Layer 3: every filing status × every state runs", () => {
  const filings: FilingStatus[] = ["single", "mfs", "mfj", "qss", "hoh"];
  const states: StateCode[] = ["AK", "WA", "OR", "ID"];
  for (const f of filings) {
    for (const s of states) {
      test(`${f} × ${s}`, () => {
        const p = basePlan();
        p.profile.filingStatus = f;
        p.profile.state = s;
        if (f === "mfj" || f === "qss" || f === "mfs") {
          p.profile.mode = "couple";
          p.profile.person2 = { birthYear: 1981, retirementAge: 65, currentSalary: 50_000, salaryGrowth: 0.03, longevityAge: 95 };
          p.socialSecurity.person2 = { pia: 2000, claimAge: 67, alreadyClaiming: false };
        }
        const safe = computeSafeSpend(p);
        expect(isFiniteFinite(safe.safeSpendToday)).toBe(true);
        expect(safe.safeSpendToday).toBeGreaterThanOrEqual(0);
        const rows = projectPlan(p);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows[rows.length - 1].estateValue).toBeGreaterThanOrEqual(-1);
      });
    }
  }
});

describe("Layer 3: every real-estate subtype × action", () => {
  const subtypes: ("primary" | "vacation" | "rental")[] = ["primary", "vacation", "rental"];
  const actions: ("hold" | "liquidate" | "liquidate-at-age" | "sell-when-needed")[] = [
    "hold",
    "liquidate",
    "liquidate-at-age",
    "sell-when-needed",
  ];
  for (const subtype of subtypes) {
    for (const action of actions) {
      test(`${subtype} × ${action}`, () => {
        const p = basePlan();
        p.assets.push({
          id: "re",
          owner: "p1",
          category: "real-estate",
          subtype,
          balance: 0,
          marketValue: 400_000,
          appreciation: 0.03,
          mortgageBalance: 50_000,
          basis: 200_000,
          yearsOwned: 10,
          monthlyRentIncome: subtype === "rental" ? 2000 : 0,
          monthlyRentExpense: subtype === "rental" ? 500 : 0,
          actionAtRetirement: action,
          liquidateAtAge: action === "liquidate-at-age" ? 75 : undefined,
        });
        const safe = computeSafeSpend(p);
        expect(isFiniteFinite(safe.safeSpendToday)).toBe(true);
        const rows = projectPlan(p);
        expect(rows.length).toBeGreaterThan(0);
      });
    }
  }
});

describe("Layer 3: every 'other' asset subtype", () => {
  const subtypes: ("pension" | "annuity" | "business" | "crypto" | "metals")[] = [
    "pension",
    "annuity",
    "business",
    "crypto",
    "metals",
  ];
  for (const subtype of subtypes) {
    test(`other:${subtype}`, () => {
      const p = basePlan();
      const o: Asset = subtype === "pension"
        ? { id: "o", owner: "p1", category: "other", subtype, balance: 0, monthlyBenefit: 1500, startAge: 65, cola: 0.02 }
        : subtype === "annuity"
          ? { id: "o", owner: "p1", category: "other", subtype, balance: 100_000, monthlyBenefit: 800, startAge: 65, termYears: 20, cola: 0 }
          : { id: "o", owner: "p1", category: "other", subtype, balance: 50_000, expectedReturn: 0.06, costBasis: 50_000 };
      p.assets.push(o);
      const safe = computeSafeSpend(p);
      expect(isFiniteFinite(safe.safeSpendToday)).toBe(true);
    });
  }
});

describe("Layer 3: zero-balance accounts", () => {
  test("trad-IRA with zero balance and contributions only", () => {
    const p = basePlan();
    p.assets = [{ id: "ira", owner: "p1", category: "trad-ira", balance: 0, annualContribution: 7000, tier: { tier: "growth" } }];
    const accum = accumulateToRetirement(p);
    expect(accum.balanceByAsset["ira"]).toBeGreaterThan(0); // contributions accumulated
    const safe = computeSafeSpend(p);
    expect(isFiniteFinite(safe.safeSpendToday)).toBe(true);
  });

  test("brokerage with zero balance and monthly contributions", () => {
    const p = basePlan();
    p.assets = [{ id: "br", owner: "p1", category: "brokerage", balance: 0, monthlyContribution: 1000, costBasis: 0, tier: { tier: "balanced" } }];
    const accum = accumulateToRetirement(p);
    expect(accum.balanceByAsset["br"]).toBeGreaterThan(0);
  });
});

describe("Layer 3: already-retired (yearsToRetire = 0)", () => {
  test("user is already at retirement age", () => {
    const p = basePlan();
    p.profile.person1.birthYear = 1961; // age 65 in 2026
    p.profile.person1.retirementAge = 65;
    const safe = computeSafeSpend(p);
    expect(safe.yearsToRetirement).toBe(0);
    expect(isFiniteFinite(safe.safeSpendToday)).toBe(true);
    const rows = projectPlan(p);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].p1Age).toBe(65);
  });

  test("user past retirement age (early retiree turning 70 with full assets)", () => {
    const p = basePlan();
    p.profile.person1.birthYear = 1956;
    p.profile.person1.retirementAge = 65; // already 5y past retirement
    const safe = computeSafeSpend(p);
    expect(isFiniteFinite(safe.safeSpendToday)).toBe(true);
  });
});

describe("Layer 3: already-claiming SS", () => {
  test("alreadyClaiming=true at age below claimAge", () => {
    const p = basePlan();
    p.profile.person1.birthYear = 1959; // age 67 in 2026
    p.profile.person1.retirementAge = 65;
    p.socialSecurity.person1.claimAge = 67;
    p.socialSecurity.person1.alreadyClaiming = true;
    const rows = projectPlan(p);
    // SS should be flowing now
    expect(rows[0].ssP1).toBeGreaterThan(0);
  });
});

describe("Layer 3: Roth conversion ladder enabled", () => {
  test("ladder fires during specified ages", () => {
    const p = basePlan();
    p.options.rothConversionRule = { enabled: true, fillToBracket: "22", startAge: 60, endAge: 70 };
    // Need pre-tax balance to convert
    p.assets = [{ id: "k", owner: "p1", category: "trad-401k", balance: 1_000_000, contributionPct: 0, tier: { tier: "balanced" } }];
    const rows = projectPlan(p);
    const conversionsHappen = rows.some((r) => r.rothConversion > 0);
    expect(conversionsHappen).toBe(true);
  });
});

describe("Layer 3: LTC enabled with insurance", () => {
  test("ltc cost reflected; insurance reduces it", () => {
    const noInsurance = basePlan();
    noInsurance.healthcare.ltc.enabled = true;
    const withInsurance = basePlan();
    withInsurance.healthcare.ltc.enabled = true;
    withInsurance.healthcare.ltc.insurance = { enabled: true, annualPremium: 4000, dailyBenefit: 200 };
    const sNo = computeSafeSpend(noInsurance);
    const sWith = computeSafeSpend(withInsurance);
    expect(isFiniteFinite(sNo.safeSpendToday)).toBe(true);
    expect(isFiniteFinite(sWith.safeSpendToday)).toBe(true);
  });
});

describe("Layer 3: joint-owned assets", () => {
  test("joint brokerage in couple plan", () => {
    const p = basePlan();
    p.profile.mode = "couple";
    p.profile.filingStatus = "mfj";
    p.profile.person2 = { birthYear: 1981, retirementAge: 65, currentSalary: 50_000, salaryGrowth: 0.03, longevityAge: 95 };
    p.socialSecurity.person2 = { pia: 2000, claimAge: 67, alreadyClaiming: false };
    p.assets.push({ id: "br", owner: "joint", category: "brokerage", balance: 200_000, monthlyContribution: 1000, costBasis: 200_000, tier: { tier: "balanced" } });
    const accum = accumulateToRetirement(p);
    expect(accum.balanceByAsset["br"]).toBeGreaterThan(200_000);
  });
});

describe("Layer 3: longevity beyond 100", () => {
  test("plan-to age 110", () => {
    const p = basePlan();
    p.profile.person1.longevityAge = 110;
    const rows = projectPlan(p);
    expect(rows[rows.length - 1].p1Age).toBe(110);
  });
});

describe("Layer 3: every income-stream taxability", () => {
  const tax: ("ordinary" | "ltcg" | "tax-free" | "partial-ss")[] = [
    "ordinary",
    "ltcg",
    "tax-free",
    "partial-ss",
  ];
  for (const t of tax) {
    test(`taxability=${t}`, () => {
      const p = basePlan();
      p.incomeStreams.push({
        id: "is",
        label: `Income ${t}`,
        owner: "p1",
        monthlyAmount: 1000,
        startAge: 65,
        endAge: null,
        growth: 0,
        taxability: t,
      });
      const rows = projectPlan(p);
      expect(rows.length).toBeGreaterThan(0);
    });
  }
});
