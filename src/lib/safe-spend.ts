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
 * Scale all expense categories uniformly so their annual total equals
 * `annualSpendToday`. Preserves each category's startAge/endAge/phaseOut/stepChange
 * shape so age-bound expenses still phase in/out correctly.
 *
 * Falls back to a single synthetic category when the user has no expenses entered yet.
 */
function planWithBaseSpend(plan: Plan, annualSpendToday: number): Plan {
  const currentTotal = plan.expenses.reduce((s, e) => s + e.monthlyToday * 12, 0);
  if (currentTotal <= 0) {
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
  const scale = annualSpendToday / currentTotal;
  return {
    ...plan,
    expenses: plan.expenses.map((e) => ({ ...e, monthlyToday: e.monthlyToday * scale })),
  };
}

function yearsToRetireForOwner(
  plan: Plan,
  owner: "p1" | "p2" | "joint",
): number {
  const baseYear = plan.profile.taxYear;
  const p1Age = baseYear - plan.profile.person1.birthYear;
  const p1Years = Math.max(0, plan.profile.person1.retirementAge - p1Age);
  if (owner === "p1" || !plan.profile.person2) return p1Years;
  const p2Age = baseYear - plan.profile.person2.birthYear;
  const p2Years = Math.max(0, plan.profile.person2.retirementAge - p2Age);
  if (owner === "p2") return p2Years;
  return Math.max(p1Years, p2Years); // joint
}

function yearsToRetire(plan: Plan): number {
  return yearsToRetireForOwner(plan, "p1");
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

/**
 * Deterministic: success when last estate ≥ 0 and no shortfall years.
 *
 * The shortfall floor (`< 1`) tolerates floating-point noise — the iterative
 * tax/withdrawal solver can return shortfalls in the cents range when buckets
 * fully cover spend, and a strict `=== 0` check would reject those as failures.
 */
function deterministicSuccess(plan: Plan): boolean {
  const rows = projectPlan(plan);
  if (rows.length === 0) return true;
  const last = rows[rows.length - 1];
  if (last.estateValue < 0) return false;
  return rows.every((r) => r.shortfall < 1);
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

/**
 * Add `extraAnnual` of contributions to the chosen asset, mirroring how the
 * accumulation phase reads each asset type's contribution mechanism. Returns
 * a cloned plan; does not mutate the input.
 *
 * For 401k-style accounts, extra is converted to additional `contributionPct`
 * relative to the owner's CURRENT salary (slight approximation since salary
 * grows over time, but stable enough for bisection).
 */
function planWithExtraContribution(
  plan: Plan,
  assetId: string | null,
  extraAnnual: number,
): Plan {
  if (extraAnnual <= 0) return plan;

  if (assetId === null) {
    return {
      ...plan,
      assets: [
        ...plan.assets,
        {
          id: "_synthetic_extra",
          owner: "p1",
          category: "brokerage",
          balance: 0,
          monthlyContribution: extraAnnual / 12,
          costBasis: 0,
          tier: { tier: "custom", customMean: 0.07, customStdev: 0.10 },
        },
      ],
    };
  }

  const ownerSalary = (owner: "p1" | "p2" | "joint"): number => {
    if (owner === "p2" && plan.profile.person2) return plan.profile.person2.currentSalary;
    return plan.profile.person1.currentSalary;
  };

  return {
    ...plan,
    assets: plan.assets.map((a) => {
      if (a.id !== assetId) return a;
      switch (a.category) {
        case "trad-401k":
        case "roth-401k": {
          const sal = ownerSalary(a.owner) || 1;
          const extraPct = extraAnnual / sal;
          return { ...a, contributionPct: (a.contributionPct ?? 0) + extraPct };
        }
        case "trad-ira":
        case "roth-ira":
        case "sep-ira":
        case "hsa":
          return { ...a, annualContribution: (a.annualContribution ?? 0) + extraAnnual };
        case "brokerage":
          return {
            ...a,
            monthlyContribution: (a.monthlyContribution ?? 0) + extraAnnual / 12,
          };
        default:
          return a;
      }
    }),
  };
}

/**
 * Bisect on extra annual contribution: smallest amount that makes the
 * deterministic projection sustain `goalToday` base spend without shortfalls
 * and with non-negative final estate.
 *
 * Uses drain-zero semantics regardless of the user's chosen safe-spend method
 * because nesting MC inside a bisection would be prohibitively slow. The MC
 * card still shows the MC safe-spend itself; only the gap-fill number is
 * deterministic.
 */
function bisectExtraContribution(
  plan: Plan,
  goalToday: number,
  assetId: string | null,
): number {
  const test = (extra: number): boolean => {
    const planTested = planWithBaseSpend(
      planWithExtraContribution(plan, assetId, extra),
      goalToday,
    );
    const rows = projectPlan(planTested);
    if (rows.length === 0) return true;
    const last = rows[rows.length - 1];
    if (last.estateValue < 0) return false;
    return rows.every((r) => r.shortfall < 1);
  };

  if (test(0)) return 0;

  let hi = Math.max(goalToday * 2, 50_000);
  let attempts = 0;
  while (!test(hi) && attempts < 8) {
    hi *= 2;
    attempts++;
  }
  if (!test(hi)) return hi;

  let lo = 0;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (test(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Average per-year healthcare + LTC cost (nominal) the engine projects across
 * retirement, using the user's plan with current expenses in place. Lets the 4%
 * rule output a BASE spend comparable to drain-zero / MC (which subtract these
 * by simulating the full draw).
 */
function averageHealthcareNominal(plan: Plan): number {
  const rows = projectPlan(plan);
  const retirementRows = rows.filter((r) => r.expensesHealthcare > 0);
  if (retirementRows.length === 0) return 0;
  const sum = retirementRows.reduce((s, r) => s + r.expensesHealthcare, 0);
  return sum / retirementRows.length;
}

export function computeSafeSpend(plan: Plan): SafeSpendResult {
  const method = plan.safeSpend.method;
  const yrs = yearsToRetire(plan);
  const port = portfolioAtRetirement(plan);
  const inflation = plan.profile.inflation;
  const inflationFactor = Math.pow(1 + inflation, yrs);

  let safeSpendNominalAtRetirement = 0;

  if (method === "4pct") {
    // Naive 4% applied to retirement-year portfolio, then reduced by avg healthcare/LTC
    // so the figure represents BASE spend (apples-to-apples with goal input).
    const grossNominal = port * 0.04;
    const avgHc = averageHealthcareNominal(plan);
    safeSpendNominalAtRetirement = Math.max(0, grossNominal - avgHc);
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

  const assetId = plan.safeSpend.extraContribAssetId ?? null;
  const asset = assetId ? plan.assets.find((a) => a.id === assetId) ?? null : null;
  const assetReturn = asset ? preRetReturn(asset) : 0.07;
  const horizon = asset
    ? yearsToRetireForOwner(plan, asset.owner)
    : safe.yearsToRetirement;

  if (goalToday <= safe.safeSpendToday) {
    return {
      requiredAnnualContribution: 0,
      portfolioGapNominal: 0,
      assetReturn,
      assetId,
      assetLabel: asset ? (asset.nickname ?? asset.category) : "default 7%",
    };
  }

  // Direct bisection on the contribution amount: monotonic, no slope estimation,
  // robust to the concave safe-spend-vs-portfolio curve. Uses deterministic
  // (drain-zero) success criterion; MC users get the deterministic estimate
  // alongside their MC-based safe-spend figure.
  const requiredAnnualContribution = bisectExtraContribution(plan, goalToday, assetId);

  // Back out the implied portfolio gap from the FV formula for display.
  const fv = fvAnnuityFactor(assetReturn, horizon);
  const portfolioGapNominal = requiredAnnualContribution * fv;

  return {
    requiredAnnualContribution,
    portfolioGapNominal,
    assetReturn,
    assetId,
    assetLabel: asset ? (asset.nickname ?? asset.category) : "default 7%",
  };
}
