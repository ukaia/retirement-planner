import type { Asset, Plan } from "../state/schema";
import { tierFor, type TierKey } from "./tax-constants";

export type BucketKey = "taxable" | "traditional" | "roth" | "hsa";

export type AllocationByBucket = Record<BucketKey, { balance: number; weightedReturn: number; tiers: Record<TierKey, number> }>;

const FINANCIAL_TIERS: TierKey[] = [
  "income-growth",
  "balanced",
  "growth-income",
  "growth",
  "aggressive-growth",
  "custom",
];

function bucketFor(asset: Asset): BucketKey | null {
  switch (asset.category) {
    case "brokerage":
      return "taxable";
    case "trad-401k":
    case "trad-ira":
    case "sep-ira":
      return "traditional";
    case "roth-401k":
    case "roth-ira":
      return "roth";
    case "hsa":
      return "hsa";
    default:
      return null;
  }
}

export function allocationByBucket(plan: Plan): AllocationByBucket {
  const result: AllocationByBucket = {
    taxable: emptyBucket(),
    traditional: emptyBucket(),
    roth: emptyBucket(),
    hsa: emptyBucket(),
  };
  for (const a of plan.assets) {
    const bucket = bucketFor(a);
    if (bucket === null) continue;
    if (
      a.category === "real-estate" ||
      a.category === "other"
    )
      continue;
    const tk = a.tier.tier;
    const mean =
      tk === "custom" ? a.tier.customMean ?? 0.08 : tierFor(tk).mean;
    result[bucket].balance += a.balance;
    result[bucket].tiers[tk] = (result[bucket].tiers[tk] ?? 0) + a.balance;
    result[bucket].weightedReturn += mean * a.balance;
  }
  for (const k of Object.keys(result) as BucketKey[]) {
    if (result[k].balance > 0) {
      result[k].weightedReturn /= result[k].balance;
    }
  }
  return result;
}

function emptyBucket(): AllocationByBucket[BucketKey] {
  return {
    balance: 0,
    weightedReturn: 0,
    tiers: Object.fromEntries(FINANCIAL_TIERS.map((t) => [t, 0])) as Record<TierKey, number>,
  };
}

/**
 * Score 0–100. Higher = better tax-aware placement.
 * Heuristics:
 *  - Aggressive growth in Roth = bonus (tax-free compounding)
 *  - Aggressive growth in Taxable = penalty (tax drag on dividends + capital gains)
 *  - Income/growth (bond-heavy) in Traditional = bonus (defer ordinary income)
 *  - Income/growth in Taxable = penalty (annual interest taxed as ordinary)
 *  - Income/growth in Roth = mild penalty (wasted tax-free space)
 */
export function locationScore(plan: Plan): {
  score: number;
  bonuses: number;
  penalties: number;
  suggestions: string[];
} {
  const a = allocationByBucket(plan);
  let bonuses = 0;
  let penalties = 0;
  const suggestions: string[] = [];

  const aggressiveInRoth = a.roth.tiers["aggressive-growth"] + a.roth.tiers["growth"];
  const aggressiveInTaxable = a.taxable.tiers["aggressive-growth"] + a.taxable.tiers["growth"];
  const conservativeInTraditional = a.traditional.tiers["income-growth"] + a.traditional.tiers["balanced"];
  const conservativeInTaxable = a.taxable.tiers["income-growth"];
  const conservativeInRoth = a.roth.tiers["income-growth"];

  bonuses += aggressiveInRoth * 1.0;
  bonuses += conservativeInTraditional * 0.7;

  penalties += aggressiveInTaxable * 0.5;
  penalties += conservativeInTaxable * 0.8;
  penalties += conservativeInRoth * 0.3;

  if (aggressiveInTaxable > 0 && a.roth.balance > 0) {
    suggestions.push(
      "Consider moving aggressive-growth holdings from Taxable to Roth so the gains compound tax-free.",
    );
  }
  if (conservativeInTaxable > 0 && a.traditional.balance > 0) {
    suggestions.push(
      "Bond-heavy holdings in Taxable generate ordinary-income interest each year. Hold them in Traditional instead.",
    );
  }
  if (conservativeInRoth > 0 && a.taxable.balance > 0) {
    suggestions.push(
      "Roth tax-free space is precious — favor highest-growth assets there, not bonds.",
    );
  }

  const totalBalance = a.taxable.balance + a.traditional.balance + a.roth.balance + a.hsa.balance;
  if (totalBalance === 0) {
    return { score: 0, bonuses: 0, penalties: 0, suggestions: ["Add some financial accounts to score."] };
  }
  const raw = (bonuses - penalties) / totalBalance;
  // Map raw [-1, 1] roughly to [0, 100], clamping.
  const score = Math.max(0, Math.min(100, 50 + raw * 50));
  return { score: Math.round(score), bonuses, penalties, suggestions };
}
