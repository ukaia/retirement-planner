import type { Asset, Plan } from "../state/schema";
import { projectPlan, type ProjectionRow, type ReturnSamples } from "./projection";
import { tierFor, type TierKey } from "./tax-constants";

/**
 * Box–Muller transform: returns one standard-normal sample.
 */
export function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Mulberry32 deterministic PRNG. Seeded so MC runs are reproducible.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tierMeanStdev(asset: Asset): { mean: number; stdev: number } {
  if (
    asset.category === "trad-401k" ||
    asset.category === "roth-401k" ||
    asset.category === "trad-ira" ||
    asset.category === "roth-ira" ||
    asset.category === "sep-ira" ||
    asset.category === "hsa" ||
    asset.category === "brokerage"
  ) {
    if (asset.tier.tier === "custom") {
      return {
        mean: asset.tier.customMean ?? 0.08,
        stdev: asset.tier.customStdev ?? 0.12,
      };
    }
    const t = tierFor(asset.tier.tier as TierKey);
    return { mean: t.mean, stdev: t.stdev };
  }
  if (asset.category === "real-estate") {
    return { mean: asset.appreciation, stdev: 0.06 };
  }
  // other
  if (asset.category === "other") {
    const ret = asset.expectedReturn ?? asset.appreciation ?? 0;
    return { mean: ret, stdev: 0.10 };
  }
  return { mean: 0, stdev: 0 };
}

/**
 * Build a per-year sample of returns. Each bucket category gets a weighted-average
 * draw across its constituent assets. Real estate and other assets get individual draws.
 */
function buildSamples(args: {
  plan: Plan;
  years: number;
  rand: () => number;
}): ReturnSamples {
  const byYear: ReturnSamples["byYear"] = [];
  const inflBase = args.plan.profile.inflation;
  const inflStdev = 0.01;

  // Group assets into bucket categories.
  const bucketAssets = {
    taxable: [] as Asset[],
    traditional: [] as Asset[],
    roth: [] as Asset[],
    hsa: [] as Asset[],
  };
  const re: Asset[] = [];
  const others: Asset[] = [];

  for (const a of args.plan.assets) {
    switch (a.category) {
      case "brokerage":
        bucketAssets.taxable.push(a);
        break;
      case "trad-401k":
      case "trad-ira":
      case "sep-ira":
        bucketAssets.traditional.push(a);
        break;
      case "roth-401k":
      case "roth-ira":
        bucketAssets.roth.push(a);
        break;
      case "hsa":
        bucketAssets.hsa.push(a);
        break;
      case "real-estate":
        re.push(a);
        break;
      case "other":
        others.push(a);
        break;
    }
  }

  function drawBucket(assets: Asset[]): number {
    if (assets.length === 0) return 0;
    let totalWeight = 0;
    let weightedDraw = 0;
    for (const a of assets) {
      const { mean, stdev } = tierMeanStdev(a);
      const draw = mean + stdev * gaussian(args.rand);
      const weight = a.balance > 0 ? a.balance : 1;
      weightedDraw += draw * weight;
      totalWeight += weight;
    }
    return totalWeight > 0 ? weightedDraw / totalWeight : 0;
  }

  for (let i = 0; i < args.years; i++) {
    const taxable = drawBucket(bucketAssets.taxable);
    const traditional = drawBucket(bucketAssets.traditional);
    const roth = drawBucket(bucketAssets.roth);
    const hsa = drawBucket(bucketAssets.hsa);
    const realEstate: Record<string, number> = {};
    for (const a of re) {
      const { mean, stdev } = tierMeanStdev(a);
      realEstate[a.id] = mean + stdev * gaussian(args.rand);
    }
    const othersRet: Record<string, number> = {};
    for (const a of others) {
      const { mean, stdev } = tierMeanStdev(a);
      othersRet[a.id] = mean + stdev * gaussian(args.rand);
    }
    const inflation = Math.max(0, inflBase + inflStdev * gaussian(args.rand));
    byYear.push({
      taxable,
      traditional,
      roth,
      hsa,
      realEstate,
      others: othersRet,
      inflation,
    });
  }
  return { byYear };
}

export type MonteCarloResult = {
  simulations: number;
  successRate: number; // fraction of sims with non-negative final estate
  /** Per-year percentiles of estate value: [10, 25, 50, 75, 90] */
  percentiles: { years: number[]; bands: { p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[] } };
  finalEstateDistribution: number[]; // sorted ascending
  worst10pct: { medianDepletionAge: number | null; medianFinalEstate: number };
};

export function runMonteCarlo(args: {
  plan: Plan;
  simulations: number;
  seed?: number;
  onProgress?: (done: number, total: number) => void;
}): MonteCarloResult {
  const { plan, simulations } = args;
  // Single deterministic run to size years.
  const detRows = projectPlan(plan);
  const years = detRows.length;

  const rand = mulberry32(args.seed ?? 0xdecafbad);

  const estateMatrix: number[][] = []; // sims × years
  const finalEstates: number[] = [];
  const depletionAges: (number | null)[] = [];

  for (let sim = 0; sim < simulations; sim++) {
    const samples = buildSamples({ plan, years, rand });
    const rows = projectPlan(plan, samples);
    const path = rows.map((r) => Math.max(0, r.estateValue));
    estateMatrix.push(path);
    finalEstates.push(path[path.length - 1]);
    let depletionAge: number | null = null;
    for (const r of rows) {
      if (r.estateValue <= 0 || r.shortfall > 0) {
        depletionAge = r.p1Age;
        break;
      }
    }
    depletionAges.push(depletionAge);
    if (args.onProgress && (sim & 31) === 0) args.onProgress(sim, simulations);
  }
  if (args.onProgress) args.onProgress(simulations, simulations);

  const successCount = depletionAges.filter((d) => d === null).length;
  const successRate = successCount / simulations;

  // Build percentile bands per year.
  const yearsList = detRows.map((r) => r.year);
  const bands = { p10: [] as number[], p25: [] as number[], p50: [] as number[], p75: [] as number[], p90: [] as number[] };
  for (let y = 0; y < years; y++) {
    const col = estateMatrix.map((row) => row[y]).sort((a, b) => a - b);
    const at = (q: number) => col[Math.floor((col.length - 1) * q)];
    bands.p10.push(at(0.10));
    bands.p25.push(at(0.25));
    bands.p50.push(at(0.50));
    bands.p75.push(at(0.75));
    bands.p90.push(at(0.90));
  }

  const sortedFinal = [...finalEstates].sort((a, b) => a - b);
  const worstQty = Math.max(1, Math.floor(simulations * 0.10));
  const worst10 = sortedFinal.slice(0, worstQty);
  const medianFinalEstate = worst10[Math.floor(worst10.length / 2)] ?? 0;

  const sortedDepletions = depletionAges.filter((d) => d !== null) as number[];
  sortedDepletions.sort((a, b) => a - b);
  const worstDepletions = sortedDepletions.slice(0, Math.max(1, Math.floor(simulations * 0.10)));
  const medianDepletionAge =
    worstDepletions.length > 0
      ? worstDepletions[Math.floor(worstDepletions.length / 2)]
      : null;

  return {
    simulations,
    successRate,
    percentiles: { years: yearsList, bands },
    finalEstateDistribution: sortedFinal,
    worst10pct: { medianDepletionAge, medianFinalEstate },
  };
}

export type { ProjectionRow };
