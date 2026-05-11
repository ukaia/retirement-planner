import { describe, expect, test } from "vitest";
import { accumulateToRetirement, compoundOneYear } from "./growth";
import type { Plan } from "../state/schema";

describe("compoundOneYear", () => {
  test("zero return, zero contribution", () => {
    expect(
      compoundOneYear({ startBalance: 100_000, annualContribution: 0, annualReturn: 0 }),
    ).toBeCloseTo(100_000, 2);
  });

  test("$10k contribution at 0% adds $10k", () => {
    expect(
      compoundOneYear({ startBalance: 0, annualContribution: 10_000, annualReturn: 0 }),
    ).toBeCloseTo(10_000, 2);
  });

  test("$100k at 12% no contribution → ~$112,683 (monthly compounded)", () => {
    const r = compoundOneYear({
      startBalance: 100_000,
      annualContribution: 0,
      annualReturn: 0.12,
    });
    // (1 + 0.01)^12 = 1.126825
    expect(r).toBeCloseTo(100_000 * Math.pow(1.01, 12), 0);
  });
});

describe("accumulateToRetirement", () => {
  function basePlan(): Plan {
    return {
      schemaVersion: 1,
      profile: {
        mode: "single",
        person1: {
          birthYear: 1980,
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
          enabled: true,
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
      safeSpend: { method: "monte-carlo", mcThreshold: 0.9 },
    };
  }

  test("brokerage at Growth/Income (9.62%) over 19 years from age 46 to 65", () => {
    const plan = basePlan();
    plan.assets = [
      {
        id: "a1",
        owner: "p1",
        category: "brokerage",
        balance: 100_000,
        monthlyContribution: 0,
        costBasis: 100_000,
        tier: { tier: "growth-income" },
      },
    ];
    const r = accumulateToRetirement(plan);
    // Age now (2026 - 1980) = 46, retire at 65 → 19 years.
    // 100k * (1 + .0962/12)^(12*19) ≈ 100k * 6.07x
    const expected = 100_000 * Math.pow(1 + 0.0962 / 12, 12 * 19);
    expect(r.balanceByAsset.a1).toBeCloseTo(expected, -1);
  });

  test("salary trajectory growth", () => {
    const plan = basePlan();
    const r = accumulateToRetirement(plan);
    expect(r.salaryByYear.p1[2026]).toBeCloseTo(100_000, 2);
    expect(r.salaryByYear.p1[2027]).toBeCloseTo(103_000, 2);
    expect(r.salaryByYear.p1[2030]).toBeCloseTo(100_000 * Math.pow(1.03, 4), 0);
  });

  test("real estate appreciates and stops contributing", () => {
    const plan = basePlan();
    plan.assets = [
      {
        id: "h1",
        owner: "joint",
        category: "real-estate",
        subtype: "primary",
        balance: 0,
        marketValue: 500_000,
        appreciation: 0.035,
        mortgageBalance: 0,
        basis: 200_000,
        yearsOwned: 10,
        monthlyRentIncome: 0,
        monthlyRentExpense: 0,
        actionAtRetirement: "hold",
      },
    ];
    const r = accumulateToRetirement(plan);
    expect(r.balanceByAsset.h1).toBeCloseTo(500_000 * Math.pow(1.035, 19), 0);
  });

  test("split retirement: later-retiring spouse's assets cut at earlier retire year", () => {
    const plan = basePlan();
    // p1 retires at 65; add p2 who retires at 70.
    plan.profile.mode = "couple";
    plan.profile.person2 = {
      birthYear: 1980,
      retirementAge: 70,
      currentSalary: 0,
      salaryGrowth: 0.03,
      longevityAge: 95,
    };
    plan.assets = [
      {
        id: "p2-bro",
        owner: "p2",
        category: "brokerage",
        balance: 100_000,
        monthlyContribution: 0,
        costBasis: 100_000,
        tier: { tier: "growth-income" },
      },
    ];
    const r = accumulateToRetirement(plan);
    // p1Age=46, p2Age=46. min(65-46, 70-46)=19 years. Should compound 19 years, not 24.
    const expected19 = 100_000 * Math.pow(1 + 0.0962 / 12, 12 * 19);
    expect(r.balanceByAsset["p2-bro"]).toBeCloseTo(expected19, -1);
  });

  test("401(k) with employee + employer match grows from salary", () => {
    const plan = basePlan();
    plan.assets = [
      {
        id: "k1",
        owner: "p1",
        category: "trad-401k",
        balance: 50_000,
        contributionPct: 0.10,
        employerMatchPct: 0.04,
        tier: { tier: "balanced" },
      },
    ];
    const r = accumulateToRetirement(plan);
    expect(r.balanceByAsset.k1).toBeGreaterThan(50_000); // grew
    // ~19 years at 8.12% with $14k contributions growing 3%/y → multiple hundreds of thousands.
    expect(r.balanceByAsset.k1).toBeGreaterThan(500_000);
  });

  test("brokerage with pre-retirement monthly withdrawal grows less than the no-withdrawal baseline", () => {
    const plan = basePlan();
    plan.assets = [
      {
        id: "bro",
        owner: "p1",
        category: "brokerage",
        balance: 1_000_000,
        monthlyContribution: 0,
        costBasis: 1_000_000,
        tier: { tier: "balanced" },
      },
    ];
    const baseline = accumulateToRetirement(plan).balanceByAsset.bro;

    plan.assets = [
      {
        id: "bro",
        owner: "p1",
        category: "brokerage",
        balance: 1_000_000,
        monthlyContribution: 0,
        costBasis: 1_000_000,
        tier: { tier: "balanced" },
        // CoastFire: pull $4k/mo from age 50 until retirement at 65.
        preRetMonthlyWithdrawal: 4_000,
        preRetWithdrawalStartAge: 50,
      },
    ];
    const withWithdrawals = accumulateToRetirement(plan).balanceByAsset.bro;

    expect(withWithdrawals).toBeLessThan(baseline);
    // 15 years of $48k/yr (current dollars) plus lost compounding — easily $1M+ difference.
    expect(baseline - withWithdrawals).toBeGreaterThan(700_000);
  });

  test("pre-retirement withdrawal honors start age (no effect before)", () => {
    const plan = basePlan();
    const start = 80; // age never reached before retirement at 65 → no withdrawal fires
    plan.assets = [
      {
        id: "bro",
        owner: "p1",
        category: "brokerage",
        balance: 500_000,
        monthlyContribution: 0,
        costBasis: 500_000,
        tier: { tier: "balanced" },
        preRetMonthlyWithdrawal: 5_000,
        preRetWithdrawalStartAge: start,
      },
    ];
    const r = accumulateToRetirement(plan);
    // No withdrawals fired: balance matches the deterministic compounded baseline.
    const expected = 500_000 * Math.pow(1 + 0.0812 / 12, 12 * 19);
    expect(r.balanceByAsset.bro).toBeCloseTo(expected, -1);
  });

  test("pre-retirement withdrawal end age stops the drain early", () => {
    const plan = basePlan();
    // Pull $5k/mo from 50 to 55, then stop. After 55, compound resumes uninterrupted.
    plan.assets = [
      {
        id: "bro",
        owner: "p1",
        category: "brokerage",
        balance: 1_000_000,
        monthlyContribution: 0,
        costBasis: 1_000_000,
        tier: { tier: "balanced" },
        preRetMonthlyWithdrawal: 5_000,
        preRetWithdrawalStartAge: 50,
        preRetWithdrawalEndAge: 55,
      },
    ];
    const ended = accumulateToRetirement(plan).balanceByAsset.bro;

    // Same withdrawal but running all the way through retirement age (no end).
    plan.assets = [
      {
        id: "bro",
        owner: "p1",
        category: "brokerage",
        balance: 1_000_000,
        monthlyContribution: 0,
        costBasis: 1_000_000,
        tier: { tier: "balanced" },
        preRetMonthlyWithdrawal: 5_000,
        preRetWithdrawalStartAge: 50,
      },
    ];
    const never = accumulateToRetirement(plan).balanceByAsset.bro;

    // Stopping at 55 vs running through 65 must end with more money.
    expect(ended).toBeGreaterThan(never);
  });

  test("brokerage basis decreases proportionally when net withdrawal fires", () => {
    const plan = basePlan();
    plan.assets = [
      {
        id: "bro",
        owner: "p1",
        category: "brokerage",
        balance: 1_000_000,
        monthlyContribution: 0,
        costBasis: 400_000, // 40% basis fraction
        tier: { tier: "balanced" },
        preRetMonthlyWithdrawal: 5_000,
        preRetWithdrawalStartAge: 50,
      },
    ];
    const r = accumulateToRetirement(plan);
    // Basis should drop from $400k as withdrawals consume basis proportionally.
    // Exact value depends on path; just assert it's strictly less than starting basis.
    expect(r.basisByAsset.bro).toBeLessThan(400_000);
    expect(r.basisByAsset.bro).toBeGreaterThanOrEqual(0);
  });

  test("pre-retirement withdrawal can drain bucket to zero, never negative", () => {
    const plan = basePlan();
    plan.assets = [
      {
        id: "bro",
        owner: "p1",
        category: "brokerage",
        balance: 100_000,
        monthlyContribution: 0,
        costBasis: 100_000,
        tier: { tier: "income-growth" },
        preRetMonthlyWithdrawal: 5_000, // $60k/yr against $100k → drains in ~2 yrs
        preRetWithdrawalStartAge: 46,
      },
    ];
    const r = accumulateToRetirement(plan);
    expect(r.balanceByAsset.bro).toBeGreaterThanOrEqual(0);
    expect(r.balanceByAsset.bro).toBeLessThan(50_000);
  });
});
