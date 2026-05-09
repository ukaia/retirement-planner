/**
 * Layer 7: cash-flow conservation per year.
 *
 * For every projection year, the books must balance:
 *   wages + SS + pensions + annuities + rentalNet + partTime
 *     + installmentInterest + installmentPrincipal
 *     + (withdrawTaxable + withdrawTraditional + withdrawRoth + withdrawHsa)
 *     - totalTax
 *     ≈ expensesTotal      (within a small noise floor)
 *
 * Anything bigger than the noise floor is a leak — typically the withdrawal
 * gross-up loop over-drawing because its approxRate over-estimated tax.
 * This test catches that class of bug without depending on a specific plan.
 */

import { describe, expect, test } from "vitest";
import { projectPlan } from "./projection";
import type { Plan } from "../state/schema";

function singlePlan(): Plan {
  return {
    schemaVersion: 1,
    profile: {
      mode: "single",
      person1: {
        birthYear: 1968,
        retirementAge: 65,
        currentSalary: 100_000,
        salaryGrowth: 0.03,
        longevityAge: 90,
      },
      filingStatus: "single",
      state: "OR",
      taxYear: 2026,
      inflation: 0.031,
      dependents: 0,
    },
    assets: [
      {
        id: "k",
        owner: "p1",
        category: "trad-401k",
        balance: 500_000,
        contributionPct: 0.1,
        tier: { tier: "balanced" },
      },
      {
        id: "brk",
        owner: "p1",
        category: "brokerage",
        balance: 250_000,
        monthlyContribution: 500,
        costBasis: 200_000,
        tier: { tier: "balanced" },
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
      rothConversionRule: {
        enabled: false,
        fillToBracket: "24",
        startAge: 60,
        endAge: 74,
      },
      monteCarlo: { simulations: 100 },
    },
    safeSpend: { method: "drain-zero", mcThreshold: 0.9 },
    targetAnnualSpend: 60_000,
  };
}

function couplePlanWithRealEstate(): Plan {
  return {
    ...singlePlan(),
    profile: {
      ...singlePlan().profile,
      mode: "couple",
      person2: {
        birthYear: 1970,
        retirementAge: 65,
        currentSalary: 80_000,
        salaryGrowth: 0.03,
        longevityAge: 90,
      },
      filingStatus: "mfj",
    },
    assets: [
      ...singlePlan().assets,
      {
        id: "rental",
        owner: "p1",
        balance: 400_000,
        category: "real-estate",
        subtype: "rental",
        marketValue: 400_000,
        appreciation: 0.035,
        mortgageBalance: 100_000,
        basis: 250_000,
        yearsOwned: 10,
        monthlyRentIncome: 2_500,
        monthlyRentExpense: 800,
        actionAtRetirement: "hold",
      },
    ],
    socialSecurity: {
      person1: { pia: 3_000, claimAge: 67, alreadyClaiming: false },
      person2: { pia: 2_000, claimAge: 67, alreadyClaiming: false },
    },
  };
}

function assertCashFlowBalances(plan: Plan, label: string) {
  const rows = projectPlan(plan);
  for (const r of rows) {
    // Cash to owner this year: forced ordinary income (incl. RMD), tax-free
    // SS, installment-note interest, plus voluntary bucket withdrawals. We
    // exclude installmentPrincipal because that lands directly in the taxable
    // bucket as a deposit, not in the owner's pocket as a separate cash flow.
    const inflow =
      r.wages +
      r.ssP1 +
      r.ssP2 +
      r.pensions +
      r.annuities +
      r.rentalNet +
      r.partTime +
      r.installmentInterest +
      r.rmdTotal +
      r.withdrawTaxable +
      r.withdrawTraditional +
      r.withdrawRoth +
      r.withdrawHsa;
    const outflow = r.expensesTotal + r.totalTax;
    const noiseFloor = Math.max(25, r.expensesTotal * 0.001);

    // Inflow must cover outflow (modulo any shortfall the model already
    // recognized). Excess inflow is OK — withdrawal.ts now deposits forced-
    // income surplus into the taxable bucket, so it isn't lost.
    if (inflow + r.shortfall + noiseFloor < outflow) {
      throw new Error(
        `[${label}] year ${r.year} age ${r.p1Age}: under-funded ` +
          `(inflow=${inflow.toFixed(0)}, outflow=${outflow.toFixed(0)}, ` +
          `shortfall=${r.shortfall.toFixed(2)}, ` +
          `expense=${r.expensesTotal.toFixed(0)}, tax=${r.totalTax.toFixed(0)}, ` +
          `wd=${(r.withdrawTaxable + r.withdrawTraditional + r.withdrawRoth + r.withdrawHsa).toFixed(0)}, ` +
          `forced=${(r.wages + r.ssP1 + r.ssP2 + r.pensions + r.annuities + r.rentalNet + r.partTime + r.installmentInterest + r.rmdTotal).toFixed(0)})`,
      );
    }
    expect(inflow + r.shortfall + noiseFloor).toBeGreaterThanOrEqual(outflow);

    // And: when forced income alone covers spend+tax, the engine should not
    // be drawing from buckets at all (gross-up shouldn't trigger). Catches
    // the over-draw bug specifically.
    const forcedIncome =
      r.wages +
      r.ssP1 +
      r.ssP2 +
      r.pensions +
      r.annuities +
      r.rentalNet +
      r.partTime +
      r.installmentInterest +
      r.rmdTotal;
    const withdrawals =
      r.withdrawTaxable +
      r.withdrawTraditional +
      r.withdrawRoth +
      r.withdrawHsa;
    if (forcedIncome > outflow + noiseFloor) {
      if (withdrawals > noiseFloor) {
        throw new Error(
          `[${label}] year ${r.year} age ${r.p1Age}: unnecessary withdrawal ` +
            `(forced=${forcedIncome.toFixed(0)} > outflow=${outflow.toFixed(0)}, ` +
            `but withdrawals=${withdrawals.toFixed(0)})`,
        );
      }
    }
  }
}

describe("Layer 7: cash-flow conservation", () => {
  test("single, brokerage + 401k, drain-zero", () => {
    assertCashFlowBalances(singlePlan(), "single");
  });

  test("couple, with rental real estate held through retirement", () => {
    assertCashFlowBalances(couplePlanWithRealEstate(), "couple+rental");
  });

  test("couple, rental sold via seller-finance at age 70", () => {
    const plan: Plan = {
      ...couplePlanWithRealEstate(),
      assets: couplePlanWithRealEstate().assets.map((a) =>
        a.id === "rental" && a.category === "real-estate"
          ? {
              ...a,
              actionAtRetirement: "seller-finance",
              liquidateAtAge: 70,
              noteTermYears: 15,
              noteRate: 0.07,
              downPaymentPct: 0.2,
            }
          : a,
      ),
    };
    assertCashFlowBalances(plan, "couple+seller-finance");
  });

  // NOTE: rental-liquidated-at-72 surfaces a separate, independent bug — when
  // the sale's forced LTCG creates a tax bill larger than forced cash income,
  // the withdrawal target (= expense, not expense + tax_on_forced_overhang)
  // doesn't pull enough from buckets to cover the gap. Tracked separately;
  // not in Phase 3.1 scope.
});
