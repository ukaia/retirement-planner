import type { Plan } from "../state/schema";
import { projectPlan, type ProjectionRow, type ReturnSamples } from "./projection";
import { mulberry32 } from "./monte-carlo";
import { tierFor, type TierKey } from "./tax-constants";

/**
 * Build a deterministic samples array using each asset's tier mean (no random draws).
 * Useful as a baseline that we can then mutate (apply early shocks, reverse, etc.).
 */
export function deterministicSamples(plan: Plan, years: number): ReturnSamples {
  // Sequence-risk scenarios all play out during retirement, so we use each
  // asset's retirement tier when set (glide path), falling back to its working tier.
  const wMean = (cat: "trad-401k" | "roth-401k" | "trad-ira" | "roth-ira" | "sep-ira" | "hsa" | "brokerage") => {
    let total = 0;
    let weighted = 0;
    for (const a of plan.assets) {
      if (a.category !== cat) continue;
      const tier = a.retirementTier ?? a.tier;
      const m =
        tier.tier === "custom"
          ? tier.customMean ?? 0.08
          : tierFor(tier.tier as TierKey).mean;
      weighted += m * a.balance;
      total += a.balance;
    }
    return total > 0 ? weighted / total : 0.07;
  };
  const taxable = wMean("brokerage");
  const trad =
    avg([wMean("trad-401k"), wMean("trad-ira"), wMean("sep-ira")].filter((x) => x !== 0));
  const roth = avg([wMean("roth-401k"), wMean("roth-ira")].filter((x) => x !== 0));
  const hsa = wMean("hsa");

  const realEstate: Record<string, number> = {};
  const others: Record<string, number> = {};
  for (const a of plan.assets) {
    if (a.category === "real-estate") realEstate[a.id] = a.appreciation;
    if (a.category === "other") others[a.id] = a.expectedReturn ?? a.appreciation ?? 0;
  }

  const byYear: ReturnSamples["byYear"] = [];
  for (let i = 0; i < years; i++) {
    byYear.push({
      taxable: taxable || 0.07,
      traditional: trad || 0.07,
      roth: roth || 0.08,
      hsa: hsa || 0.07,
      realEstate: { ...realEstate },
      others: { ...others },
      inflation: plan.profile.inflation,
    });
  }
  return { byYear };
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

/**
 * Override the first N years of all financial-bucket returns to a fixed shock rate.
 * Real estate and "other" continue at their own deterministic returns.
 */
export function applyEarlyShock(samples: ReturnSamples, yearsShocked: number, rate: number): ReturnSamples {
  return {
    byYear: samples.byYear.map((y, i) => {
      if (i >= yearsShocked) return y;
      return { ...y, taxable: rate, traditional: rate, roth: rate, hsa: rate };
    }),
  };
}

/**
 * Reverse the order of return samples (later years happen first).
 */
export function reverseSamples(samples: ReturnSamples): ReturnSamples {
  return { byYear: [...samples.byYear].reverse() };
}

/**
 * Build a single deterministic stochastic-looking path by drawing once per year per bucket.
 * Used to construct "normal vs reversed" comparisons that actually differ.
 */
export function singlePath(plan: Plan, years: number, seed: number): ReturnSamples {
  const rand = mulberry32(seed);
  const result = deterministicSamples(plan, years);
  // Add per-year normal noise around the mean, with bucket-level stdev.
  const buckets: Array<keyof Pick<ReturnSamples["byYear"][number], "taxable" | "traditional" | "roth" | "hsa">> = [
    "taxable",
    "traditional",
    "roth",
    "hsa",
  ];
  for (let i = 0; i < years; i++) {
    for (const b of buckets) {
      const mean = result.byYear[i][b];
      const stdev = 0.13;
      const draw = mean + stdev * gauss(rand);
      result.byYear[i][b] = draw;
    }
  }
  return result;
}

function gauss(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export type SequenceRiskScenario = {
  label: string;
  rows: ProjectionRow[];
  finalEstate: number;
  worstYearAge: number | null;
};

export type SequenceRiskBundle = {
  baseline: SequenceRiskScenario;
  shockMinus5: SequenceRiskScenario;
  shockMinus10: SequenceRiskScenario;
  shockMinus15: SequenceRiskScenario;
  forward: SequenceRiskScenario;
  reversed: SequenceRiskScenario;
};

const summarize = (rows: ProjectionRow[], label: string): SequenceRiskScenario => {
  let worst: number | null = null;
  for (const r of rows) {
    if (r.estateValue <= 0 || r.shortfall > 0) {
      worst = r.p1Age;
      break;
    }
  }
  return {
    label,
    rows,
    finalEstate: rows[rows.length - 1]?.estateValue ?? 0,
    worstYearAge: worst,
  };
};

export function runSequenceRiskScenarios(plan: Plan): SequenceRiskBundle {
  const det = deterministicSamples(plan, 60);
  const baseline = projectPlan(plan, det);
  const sm5 = projectPlan(plan, applyEarlyShock(det, 5, -0.05));
  const sm10 = projectPlan(plan, applyEarlyShock(det, 5, -0.10));
  const sm15 = projectPlan(plan, applyEarlyShock(det, 5, -0.15));
  const path = singlePath(plan, 60, 42);
  const forward = projectPlan(plan, path);
  const reversed = projectPlan(plan, reverseSamples(path));

  return {
    baseline: summarize(baseline, "Baseline (steady tier returns)"),
    shockMinus5: summarize(sm5, "First 5 yrs at -5%"),
    shockMinus10: summarize(sm10, "First 5 yrs at -10%"),
    shockMinus15: summarize(sm15, "First 5 yrs at -15%"),
    forward: summarize(forward, "Same draws, normal order"),
    reversed: summarize(reversed, "Same draws, reversed order"),
  };
}
