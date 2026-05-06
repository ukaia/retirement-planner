import type { Plan } from "./schema";

export function defaultPlan(): Plan {
  const currentYear = new Date().getFullYear();
  return {
    schemaVersion: 1,
    profile: {
      mode: "single",
      person1: {
        name: undefined,
        birthYear: currentYear - 45,
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
        id: "exp-housing",
        label: "Housing",
        monthlyToday: 2_500,
        growth: 0,
        startAge: null,
        endAge: null,
        phaseOutAtAge: null,
        stepChange: null,
      },
      {
        id: "exp-food",
        label: "Food and groceries",
        monthlyToday: 800,
        growth: 0,
        startAge: null,
        endAge: null,
        phaseOutAtAge: null,
        stepChange: null,
      },
      {
        id: "exp-transport",
        label: "Transportation",
        monthlyToday: 500,
        growth: 0,
        startAge: null,
        endAge: null,
        phaseOutAtAge: null,
        stepChange: null,
      },
      {
        id: "exp-utilities",
        label: "Utilities",
        monthlyToday: 300,
        growth: 0,
        startAge: null,
        endAge: null,
        phaseOutAtAge: null,
        stepChange: null,
      },
      {
        id: "exp-discretionary",
        label: "Discretionary",
        monthlyToday: 800,
        growth: 0,
        startAge: null,
        endAge: null,
        phaseOutAtAge: null,
        stepChange: null,
      },
      {
        id: "exp-travel",
        label: "Travel and leisure",
        monthlyToday: 600,
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

export function newAssetId(prefix = "a"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
