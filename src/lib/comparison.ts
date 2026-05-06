import type { Plan } from "../state/schema";
import { projectPlan, type ProjectionRow } from "./projection";
import { type TierKey, RETIREMENT_LIMITS } from "./tax-constants";

export type Variant = {
  id: string;
  label: string;
  description: string;
  build: (plan: Plan) => Plan;
};

const TIER_ORDER: TierKey[] = [
  "income-growth",
  "balanced",
  "growth-income",
  "growth",
  "aggressive-growth",
];

function nextTier(t: TierKey): TierKey {
  if (t === "custom") return t;
  const idx = TIER_ORDER.indexOf(t);
  return idx === -1 || idx === TIER_ORDER.length - 1 ? t : TIER_ORDER[idx + 1];
}

const baseline: Variant = {
  id: "current",
  label: "Your plan",
  description: "Current inputs as entered.",
  build: (p) => p,
};

const aggressiveSaver: Variant = {
  id: "aggressive-saver",
  label: "Aggressive saver",
  description: "+10pp to all 401(k) and brokerage contribution rates.",
  build: (p) => {
    const next = structuredClone(p);
    for (const a of next.assets) {
      if (a.category === "trad-401k" || a.category === "roth-401k") {
        a.contributionPct = Math.min(0.5, (a.contributionPct ?? 0) + 0.10);
      }
      if (a.category === "brokerage") {
        a.monthlyContribution = (a.monthlyContribution ?? 0) + 1000;
      }
    }
    return next;
  },
};

const maxContributions: Variant = {
  id: "max",
  label: "Max contributions",
  description: "401(k) and IRA bumped to IRS limits.",
  build: (p) => {
    const next = structuredClone(p);
    const limits = RETIREMENT_LIMITS[next.profile.taxYear];
    for (const a of next.assets) {
      if (a.category === "trad-401k" || a.category === "roth-401k") {
        const ownerSalary =
          a.owner === "p2" ? next.profile.person2?.currentSalary ?? 0 : next.profile.person1.currentSalary;
        if (ownerSalary > 0) {
          a.contributionPct = Math.min(0.95, limits.k401 / ownerSalary);
        }
      }
      if (a.category === "trad-ira" || a.category === "roth-ira") {
        a.annualContribution = limits.ira;
      }
    }
    return next;
  },
};

const workThreeMore: Variant = {
  id: "work3",
  label: "Work 3 more years",
  description: "Push retirement age out by 3.",
  build: (p) => {
    const next = structuredClone(p);
    next.profile.person1.retirementAge += 3;
    if (next.profile.person2) next.profile.person2.retirementAge += 3;
    return next;
  },
};

const higherReturns: Variant = {
  id: "tier-up",
  label: "One tier more aggressive",
  description: "Bump every flexible-return asset up one tier.",
  build: (p) => {
    const next = structuredClone(p);
    for (const a of next.assets) {
      if (
        a.category === "trad-401k" ||
        a.category === "roth-401k" ||
        a.category === "trad-ira" ||
        a.category === "roth-ira" ||
        a.category === "sep-ira" ||
        a.category === "hsa" ||
        a.category === "brokerage"
      ) {
        a.tier.tier = nextTier(a.tier.tier);
      }
    }
    return next;
  },
};

const delaySs70: Variant = {
  id: "delay-ss",
  label: "Delay SS to 70",
  description: "Both earners claim Social Security at 70.",
  build: (p) => {
    const next = structuredClone(p);
    next.socialSecurity.person1.claimAge = 70;
    if (next.socialSecurity.person2) next.socialSecurity.person2.claimAge = 70;
    return next;
  },
};

const rothLadder: Variant = {
  id: "roth-ladder",
  label: "Roth conversion ladder",
  description: "Convert to top of 22% bracket each year from retirement to age 73.",
  build: (p) => {
    const next = structuredClone(p);
    next.options.rothConversionRule = {
      enabled: true,
      fillToBracket: "22",
      startAge: next.profile.person1.retirementAge,
      endAge: 73,
    };
    return next;
  },
};

const combinedPush: Variant = {
  id: "combined",
  label: "Aggressive saver + delay SS",
  description: "Stack the high-savings rate with delaying Social Security to 70.",
  build: (p) => delaySs70.build(aggressiveSaver.build(p)),
};

function scaleExpenses(plan: Plan, factor: number): Plan {
  const next = structuredClone(plan);
  for (const e of next.expenses) e.monthlyToday *= factor;
  return next;
}

const spendLess10: Variant = {
  id: "spend-less-10",
  label: "Spend 10% less",
  description: "Trim every expense category by 10%. Money lasts longer for the same plan.",
  build: (p) => scaleExpenses(p, 0.9),
};

const spendLess20: Variant = {
  id: "spend-less-20",
  label: "Spend 20% less",
  description: "A leaner retirement: 20% less across the board.",
  build: (p) => scaleExpenses(p, 0.8),
};

export const VARIANTS: Variant[] = [
  baseline,
  aggressiveSaver,
  maxContributions,
  workThreeMore,
  higherReturns,
  delaySs70,
  rothLadder,
  spendLess10,
  spendLess20,
  combinedPush,
];

export type VariantResult = {
  id: string;
  label: string;
  description: string;
  retirementYear: number;
  totalAtRetirement: number;
  monthlyIncomeAtRetirement: number;
  monthlyExpenseAtRetirement: number;
  finalEstate: number;
  lifetimeTax: number;
  shortfallYears: number;
  /** Age at which liquid assets first hit zero (or shortfall first appears). null if money lasts. */
  depletionAge: number | null;
};

export function buildVariantResults(plan: Plan): VariantResult[] {
  return VARIANTS.map((v) => {
    const p = v.build(plan);
    const rows = projectPlan(p);
    return summarize(v, rows);
  });
}

function summarize(v: Variant, rows: ProjectionRow[]): VariantResult {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const totalAtRetirement =
    first.taxableBalance +
    first.traditionalBalance +
    first.rothBalance +
    first.hsaBalance +
    first.realEstateValue +
    first.otherAssetsValue;
  const monthlyIncome =
    (first.wages +
      first.ssP1 +
      first.ssP2 +
      first.pensions +
      first.annuities +
      first.rentalNet +
      first.partTime) /
    12;
  const depleted = rows.find(
    (r) =>
      r.shortfall > 0 ||
      r.taxableBalance + r.traditionalBalance + r.rothBalance + r.hsaBalance <= 0,
  );
  return {
    id: v.id,
    label: v.label,
    description: v.description,
    retirementYear: first.year,
    totalAtRetirement,
    monthlyIncomeAtRetirement: monthlyIncome,
    monthlyExpenseAtRetirement: first.expensesTotal / 12,
    finalEstate: last.estateValue,
    lifetimeTax: rows.reduce((s, r) => s + r.totalTax, 0),
    shortfallYears: rows.filter((r) => r.shortfall > 0).length,
    depletionAge: depleted ? depleted.p1Age : null,
  };
}
