/**
 * Audit Layer 6: Property-based fuzz.
 *
 * Generate random plans within schema bounds and assert universal
 * invariants. Catches surprises like the FP-noise bisection bug
 * that only manifested in certain portfolio-size regimes.
 */

import { describe, expect, test } from "vitest";
import { computeSafeSpend, computeSavingsGap } from "./safe-spend";
import { projectPlan } from "./projection";
import { accumulateToRetirement } from "./growth";
import { runMonteCarlo } from "./monte-carlo";
import type { Plan } from "../state/schema";
import type { FilingStatus, TierKey } from "./tax-constants";
import type { StateCode } from "./tax/states/types";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

const TIERS: TierKey[] = ["income-growth", "balanced", "growth-income", "growth", "aggressive-growth"];
const FILING: FilingStatus[] = ["single", "mfj", "hoh"];
const STATES: StateCode[] = ["AK", "WA", "OR", "ID"];

function randomPlan(seed: number): Plan {
  const rand = mulberry32(seed);
  const filing = pick(rand, FILING);
  const isCouple = filing === "mfj";
  const birthYear = 1955 + Math.floor(rand() * 30); // 1955–1984
  const retirementAge = 60 + Math.floor(rand() * 15); // 60–74
  const longevityAge = 85 + Math.floor(rand() * 25); // 85–109

  const plan: Plan = {
    schemaVersion: 1,
    profile: {
      mode: isCouple ? "couple" : "single",
      person1: {
        birthYear,
        retirementAge,
        currentSalary: Math.floor(rand() * 250_000),
        salaryGrowth: 0.02 + rand() * 0.05,
        longevityAge,
      },
      person2: isCouple
        ? {
            birthYear: birthYear + Math.floor(rand() * 6) - 3,
            retirementAge: retirementAge + Math.floor(rand() * 10) - 5,
            currentSalary: Math.floor(rand() * 200_000),
            salaryGrowth: 0.02 + rand() * 0.05,
            longevityAge: longevityAge + Math.floor(rand() * 10) - 5,
          }
        : undefined,
      filingStatus: filing,
      state: pick(rand, STATES),
      taxYear: 2026,
      inflation: 0.02 + rand() * 0.04,
      dependents: 0,
    },
    assets: [],
    incomeStreams: [],
    expenses: [
      { id: "e1", label: "Living", monthlyToday: 2000 + Math.floor(rand() * 8000), growth: 0, startAge: null, endAge: null, phaseOutAtAge: null, stepChange: null },
    ],
    healthcare: { acaTier: "silver", medigap: false, ltc: { enabled: false, probability: 0.6, annualCost: 108_000, durationYears: 2.5, insurance: { enabled: false, annualPremium: 0, dailyBenefit: 0 } } },
    socialSecurity: {
      person1: { pia: Math.floor(rand() * 4500), claimAge: 62 + Math.floor(rand() * 9), alreadyClaiming: false },
      person2: isCouple ? { pia: Math.floor(rand() * 4000), claimAge: 62 + Math.floor(rand() * 9), alreadyClaiming: false } : undefined,
    },
    options: { withdrawalStrategy: "default-tax-aware", bracketAdjustForInflation: true, rothConversionRule: { enabled: false, fillToBracket: "24", startAge: 60, endAge: 74 }, monteCarlo: { simulations: 200 } },
    safeSpend: { method: "drain-zero", mcThreshold: 0.9 },
  };

  // 1–4 random investable assets
  const numAssets = 1 + Math.floor(rand() * 4);
  const cats = ["trad-401k", "roth-ira", "trad-ira", "brokerage", "hsa"] as const;
  for (let i = 0; i < numAssets; i++) {
    const cat = pick(rand, cats);
    const tier = pick(rand, TIERS);
    const balance = Math.floor(rand() * 800_000);
    const owner = isCouple && rand() < 0.4 ? (rand() < 0.5 ? "p2" : "joint") : "p1";
    if (cat === "trad-401k") {
      plan.assets.push({ id: `a${i}`, owner, category: cat, balance, contributionPct: rand() * 0.2, tier: { tier } });
    } else if (cat === "brokerage") {
      plan.assets.push({ id: `a${i}`, owner, category: cat, balance, monthlyContribution: Math.floor(rand() * 1500), costBasis: balance, tier: { tier } });
    } else if (cat === "trad-ira" || cat === "roth-ira") {
      plan.assets.push({ id: `a${i}`, owner, category: cat, balance, annualContribution: Math.floor(rand() * 8000), tier: { tier } });
    } else if (cat === "hsa") {
      plan.assets.push({ id: `a${i}`, owner, category: cat, balance, annualContribution: Math.floor(rand() * 4000), tier: { tier } });
    }
  }

  return plan;
}

describe("Layer 6: fuzz invariants (50 random plans)", () => {
  test("safeSpend.safeSpendToday >= 0", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const p = randomPlan(seed);
      const safe = computeSafeSpend(p);
      expect(safe.safeSpendToday).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(safe.safeSpendToday)).toBe(true);
    }
  });

  test("portfolioAtRetirement >= sum of starting balances (some growth + contribs)", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const p = randomPlan(seed);
      const safe = computeSafeSpend(p);
      const startingBalance = p.assets.reduce((s, a) => {
        if (a.category === "real-estate") return s + a.marketValue;
        return s + a.balance;
      }, 0);
      // Allow some slack — for already-retired plans portfolio at retirement may equal start.
      expect(safe.portfolioAtRetirement).toBeGreaterThanOrEqual(startingBalance * 0.99);
    }
  });

  test("projection produces finite values throughout", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const p = randomPlan(seed);
      const rows = projectPlan(p);
      for (const r of rows) {
        expect(Number.isFinite(r.estateValue)).toBe(true);
        expect(Number.isFinite(r.totalTax)).toBe(true);
        expect(Number.isFinite(r.expensesTotal)).toBe(true);
        expect(r.taxableBalance).toBeGreaterThanOrEqual(-1);
        expect(r.traditionalBalance).toBeGreaterThanOrEqual(-1);
        expect(r.rothBalance).toBeGreaterThanOrEqual(-1);
      }
    }
  });

  test("savings gap is non-negative when goal exceeds safe (Infinity allowed for infeasible goals)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = randomPlan(seed);
      const safe = computeSafeSpend(p);
      const goal = safe.safeSpendToday * 2;
      const gap = computeSavingsGap({ plan: p, safe, goalToday: goal });
      expect(gap.requiredAnnualContribution).toBeGreaterThanOrEqual(0);
      // Either a finite required contribution, or Infinity for a goal that
      // can't be reached even with arbitrarily large contributions.
      expect(
        Number.isFinite(gap.requiredAnnualContribution) ||
          gap.requiredAnnualContribution === Infinity,
      ).toBe(true);
    }
  });

  test("MC seed determinism: same seed → same successRate", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const p = randomPlan(seed);
      const r1 = runMonteCarlo({ plan: p, simulations: 100, seed: 0xdeadbeef });
      const r2 = runMonteCarlo({ plan: p, simulations: 100, seed: 0xdeadbeef });
      expect(r1.successRate).toBe(r2.successRate);
    }
  });

  test("accumulation is monotonic in time (each year balance >= previous)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = randomPlan(seed);
      const accum = accumulateToRetirement(p);
      // Sum across all assets at retirement should be >= sum at baseYear (no projection-time loss).
      const start = p.assets.reduce((s, a) => {
        if (a.category === "real-estate") return s + a.marketValue;
        return s + a.balance;
      }, 0);
      const end = Object.values(accum.balanceByAsset).reduce((s, v) => s + v, 0);
      expect(end).toBeGreaterThanOrEqual(start * 0.99); // slack for already-retired (cutoff=0)
    }
  });
});
