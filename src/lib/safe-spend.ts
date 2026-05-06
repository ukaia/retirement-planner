import type { Asset, Plan, SafeSpendMethod } from "../state/schema";
import { accumulateToRetirement } from "./growth";
import { runMonteCarlo } from "./monte-carlo";
import { projectPlan } from "./projection";
import { tierFor } from "./tax-constants";

export type SafeSpendResult = {
  /** Annual base spend (today's $) the plan can sustain by the chosen method. */
  safeSpendToday: number;
  /** Same value expressed in nominal $ at retirement year. */
  safeSpendNominalAtRetirement: number;
  /** Total investable + real-estate + other portfolio value at retirement (nominal $). */
  portfolioAtRetirement: number;
  /** Years from baseYear to p1 retirement. */
  yearsToRetirement: number;
  method: SafeSpendMethod;
};

export type SavingsGapResult = {
  /** Annual extra contribution required to lift safeSpend to goal (today's $, going to chosen asset). */
  requiredAnnualContribution: number;
  /** Nominal gap in retirement-year portfolio value to be filled. */
  portfolioGapNominal: number;
  /** Pre-retirement annual return rate used for compounding. */
  assetReturn: number;
  /** Asset that would receive the extra contribution. */
  assetId: string | null;
  assetLabel: string;
};

/**
 * Replace plan.expenses with one synthetic category equal to `annualSpendToday`,
 * preserving the rest of the plan. Healthcare/LTC stay computed separately.
 */
function planWithBaseSpend(plan: Plan, annualSpendToday: number): Plan {
  return {
    ...plan,
    expenses: [
      {
        id: "synthetic-base",
        label: "Base spend",
        monthlyToday: annualSpendToday / 12,
        growth: 0,
        startAge: null,
        endAge: null,
        phaseOutAtAge: null,
        stepChange: null,
      },
    ],
  };
}

function yearsToRetire(plan: Plan): number {
  const baseYear = plan.profile.taxYear;
  const p1Age = baseYear - plan.profile.person1.birthYear;
  return Math.max(0, plan.profile.person1.retirementAge - p1Age);
}

function portfolioAtRetirement(plan: Plan): number {
  const accum = accumulateToRetirement(plan);
  let total = 0;
  for (const a of plan.assets) {
    total += accum.balanceByAsset[a.id] ?? 0;
  }
  return total;
}

/** Investable assets eligible to receive extra contributions. */
export function eligibleContribAssets(plan: Plan): Asset[] {
  return plan.assets.filter((a) =>
    a.category === "trad-401k" ||
    a.category === "roth-401k" ||
    a.category === "trad-ira" ||
    a.category === "roth-ira" ||
    a.category === "sep-ira" ||
    a.category === "hsa" ||
    a.category === "brokerage",
  );
}

function preRetReturn(asset: Asset): number {
  if (
    asset.category === "trad-401k" ||
    asset.category === "roth-401k" ||
    asset.category === "trad-ira" ||
    asset.category === "roth-ira" ||
    asset.category === "sep-ira" ||
    asset.category === "hsa" ||
    asset.category === "brokerage"
  ) {
    if (asset.tier.tier === "custom" && asset.tier.customMean !== undefined) {
      return asset.tier.customMean;
    }
    return tierFor(asset.tier.tier).mean;
  }
  return 0.07;
}

/** Deterministic: success when last estate ≥ 0 and no shortfall years. */
function deterministicSuccess(plan: Plan): boolean {
  const rows = projectPlan(plan);
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  if (last.estateValue < 0) return false;
  return rows.every((r) => r.shortfall === 0);
}

/** Monte Carlo: success rate ≥ threshold. Uses a small sim count for speed. */
function mcSuccess(plan: Plan, threshold: number, simulations = 200): boolean {
  const r = runMonteCarlo({ plan, simulations, seed: 0xc0ffee });
  return r.successRate >= threshold;
}

/**
 * Bisect for max annual base spend (today's $) that still satisfies `success(plan)`.
 * Searches in [lo, hi]; returns the highest spend that passes.
 */
function bisectSpend(
  plan: Plan,
  hi: number,
  success: (p: Plan) => boolean,
  iterations = 12,
): number {
  let lo = 0;
  // If even hi passes, push it up.
  let cap = hi;
  for (let bump = 0; bump < 4; bump++) {
    if (success(planWithBaseSpend(plan, cap))) {
      lo = cap;
      cap *= 2;
    } else {
      break;
    }
  }
  let lastPass = lo;
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + cap) / 2;
    if (success(planWithBaseSpend(plan, mid))) {
      lastPass = mid;
      lo = mid;
    } else {
      cap = mid;
    }
  }
  return lastPass;
}

export function computeSafeSpend(plan: Plan): SafeSpendResult {
  const method = plan.safeSpend.method;
  const yrs = yearsToRetire(plan);
  const port = portfolioAtRetirement(plan);
  const inflation = plan.profile.inflation;
  const inflationFactor = Math.pow(1 + inflation, yrs);

  let safeSpendNominalAtRetirement = 0;

  if (method === "4pct") {
    safeSpendNominalAtRetirement = port * 0.04;
  } else {
    // Seed an upper bound for the search: scale by portfolio relative to current
    // expenses, with a reasonable floor.
    const currentAnnual = plan.expenses.reduce((s, e) => s + e.monthlyToday * 12, 0);
    const seed = Math.max(currentAnnual * 2, port * 0.08, 50_000);
    let safeSpendToday = 0;
    if (method === "drain-zero") {
      safeSpendToday = bisectSpend(plan, seed, deterministicSuccess);
    } else {
      const threshold = plan.safeSpend.mcThreshold;
      safeSpendToday = bisectSpend(
        plan,
        seed,
        (p) => mcSuccess(p, threshold),
        10,
      );
    }
    safeSpendNominalAtRetirement = safeSpendToday * inflationFactor;
    return {
      safeSpendToday,
      safeSpendNominalAtRetirement,
      portfolioAtRetirement: port,
      yearsToRetirement: yrs,
      method,
    };
  }

  // 4pct path: convert nominal-at-ret back to today's $.
  const safeSpendToday = safeSpendNominalAtRetirement / inflationFactor;
  return {
    safeSpendToday,
    safeSpendNominalAtRetirement,
    portfolioAtRetirement: port,
    yearsToRetirement: yrs,
    method,
  };
}

/**
 * Future-value annuity factor: PMT × FV(r,n) = future lump sum.
 * End-of-year contributions; n discrete years at rate r.
 */
function fvAnnuityFactor(rate: number, years: number): number {
  if (years <= 0) return 0;
  if (Math.abs(rate) < 1e-9) return years;
  return (Math.pow(1 + rate, years) - 1) / rate;
}

export function computeSavingsGap(args: {
  plan: Plan;
  safe: SafeSpendResult;
  goalToday: number;
}): SavingsGapResult {
  const { plan, safe, goalToday } = args;

  if (goalToday <= safe.safeSpendToday || safe.safeSpendToday <= 0) {
    return {
      requiredAnnualContribution: 0,
      portfolioGapNominal: 0,
      assetReturn: 0,
      assetId: null,
      assetLabel: "—",
    };
  }

  // Linear extrapolation: portfolio scales linearly with sustainable spend at the
  // chosen success criterion. Holds well when income/SS/healthcare are unchanged.
  const portfolioNeededNominal = safe.portfolioAtRetirement * (goalToday / safe.safeSpendToday);
  const portfolioGapNominal = portfolioNeededNominal - safe.portfolioAtRetirement;

  const assetId = plan.safeSpend.extraContribAssetId ?? null;
  const asset = assetId ? plan.assets.find((a) => a.id === assetId) ?? null : null;
  const assetReturn = asset ? preRetReturn(asset) : 0.07;
  const fv = fvAnnuityFactor(assetReturn, safe.yearsToRetirement);
  const requiredAnnualContribution = fv > 0 ? portfolioGapNominal / fv : portfolioGapNominal;

  return {
    requiredAnnualContribution,
    portfolioGapNominal,
    assetReturn,
    assetId,
    assetLabel: asset ? (asset.nickname ?? asset.category) : "no account selected",
  };
}
