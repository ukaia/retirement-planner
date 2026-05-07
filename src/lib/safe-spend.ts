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

/**
 * Liquid (spendable) portfolio at retirement: the investable buckets only.
 * Held real estate and "other" assets are not directly withdrawable, so the 4%
 * rule should not multiply against them. Real-estate that's scheduled to
 * liquidate at retirement shows up here because projection.ts moves the
 * proceeds into the taxable bucket on the retirement year — running the
 * projection and reading the first row picks that up.
 */
function liquidPortfolioAtRetirement(plan: Plan): number {
  const rows = projectPlan(plan);
  if (rows.length === 0) return 0;
  const first = rows[0];
  return (
    first.taxableBalance +
    first.traditionalBalance +
    first.rothBalance +
    first.hsaBalance
  );
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
 * Bisect on extra annual contribution: smallest amount that satisfies `test`.
 * Caller chooses the test function: deterministic (drain-zero) for live updates,
 * Monte Carlo for the explicit Calculate path.
 */
function bisectContribGeneric(
  plan: Plan,
  goalToday: number,
  assetId: string | null,
  test: (planWithExtra: Plan) => boolean,
  iterations = 14,
): number {
  const probe = (extra: number) =>
    test(
      planWithBaseSpend(planWithExtraContribution(plan, assetId, extra), goalToday),
    );

  if (probe(0)) return 0;

  let hi = Math.max(goalToday * 2, 50_000);
  let attempts = 0;
  while (!probe(hi) && attempts < 8) {
    hi *= 2;
    attempts++;
  }
  if (!probe(hi)) return hi;

  let lo = 0;
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    if (probe(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Drain-zero bisection: smallest annual contribution that makes the deterministic
 * projection sustain goalToday with no shortfalls and non-negative final estate.
 * Fast (~75ms); used for live updates and as the gap calc for drain-zero method.
 */
function bisectExtraContribution(
  plan: Plan,
  goalToday: number,
  assetId: string | null,
): number {
  return bisectContribGeneric(plan, goalToday, assetId, (p) => {
    const rows = projectPlan(p);
    if (rows.length === 0) return true;
    const last = rows[rows.length - 1];
    if (last.estateValue < 0) return false;
    return rows.every((r) => r.shortfall < 1);
  });
}

/**
 * MC bisection: smallest annual contribution such that the simulated success
 * rate at the user's threshold meets the bar at goalToday. Slow (~20s with
 * 200 sims and 14 outer iterations); only triggered behind the Calculate button.
 */
function bisectExtraContributionMC(
  plan: Plan,
  goalToday: number,
  assetId: string | null,
  threshold: number,
  simulations = 200,
): number {
  return bisectContribGeneric(
    plan,
    goalToday,
    assetId,
    (p) => {
      const r = runMonteCarlo({ plan: p, simulations, seed: 0xc0ffee });
      return r.successRate >= threshold;
    },
    10,
  );
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
    // 4% rule applies to the LIQUID portion only — held real estate and other
    // non-investable assets aren't withdrawable. Switching a property from
    // "hold" to "liquidate at retirement" therefore changes this number,
    // because the projection shifts the proceeds into the taxable bucket.
    const liquid = liquidPortfolioAtRetirement(plan);
    const grossNominal = liquid * 0.04;
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
  /** When true and method is monte-carlo, run the (slow) MC bisection instead of the
   *  drain-zero approximation. Default false so live updates stay snappy. */
  preferMcAccurate?: boolean;
}): SavingsGapResult {
  const { plan, safe, goalToday, preferMcAccurate } = args;

  const assetId = plan.safeSpend.extraContribAssetId ?? null;
  const asset = assetId ? plan.assets.find((a) => a.id === assetId) ?? null : null;
  const assetReturn = asset ? preRetReturn(asset) : 0.07;
  const horizon = asset
    ? yearsToRetireForOwner(plan, asset.owner)
    : safe.yearsToRetirement;
  const fv = fvAnnuityFactor(assetReturn, horizon);
  const assetLabel = asset ? (asset.nickname ?? asset.category) : "default 7%";

  if (goalToday <= safe.safeSpendToday) {
    return {
      requiredAnnualContribution: 0,
      portfolioGapNominal: 0,
      assetReturn,
      assetId,
      assetLabel,
    };
  }

  let requiredAnnualContribution: number;
  let portfolioGapNominal: number;

  if (plan.safeSpend.method === "4pct") {
    // Analytic: invert safeNominal = liquid × 0.04 − avgHc → solve for liquid_needed.
    // Compares against the liquid portfolio (matches the safe-spend basis above).
    const inflationFactor = Math.pow(1 + plan.profile.inflation, safe.yearsToRetirement);
    const avgHc = averageHealthcareNominal(plan);
    const liquid = liquidPortfolioAtRetirement(plan);
    const portfolioNeeded = (goalToday * inflationFactor + avgHc) / 0.04;
    portfolioGapNominal = Math.max(0, portfolioNeeded - liquid);
    requiredAnnualContribution = fv > 0 ? portfolioGapNominal / fv : portfolioGapNominal;
  } else if (plan.safeSpend.method === "monte-carlo" && preferMcAccurate) {
    // Slow path: bisect with MC inner test. Runs only when user clicked Calculate.
    requiredAnnualContribution = bisectExtraContributionMC(
      plan,
      goalToday,
      assetId,
      plan.safeSpend.mcThreshold,
    );
    portfolioGapNominal = requiredAnnualContribution * fv;
  } else {
    // drain-zero (and MC live-update fallback): direct deterministic bisection.
    requiredAnnualContribution = bisectExtraContribution(plan, goalToday, assetId);
    portfolioGapNominal = requiredAnnualContribution * fv;
  }

  return {
    requiredAnnualContribution,
    portfolioGapNominal,
    assetReturn,
    assetId,
    assetLabel,
  };
}
