import type { Asset, Plan } from "../state/schema";
import { accumulateToRetirement } from "./growth";
import { annualAcaCost, annualMedicareBase, expectedLtcAnnualCost } from "./healthcare";
import { annualIrmaaCost } from "./irmaa";
import { computeRmd } from "./rmd";
import { benefitAtClaimAge, earningsTestWithholding } from "./social-security";
import {
  SECTION_121_EXCLUSION,
  SS,
  fraMonths,
  tierFor,
  type FilingStatus,
  type TaxYear,
} from "./tax-constants";
import { withdrawForSpend } from "./withdrawal";

export type ProjectionRow = {
  year: number;
  p1Age: number;
  p2Age: number | null;
  // income components (gross)
  wages: number;
  ssP1: number;
  ssP2: number;
  pensions: number;
  annuities: number;
  rentalNet: number;
  partTime: number;
  rmdTotal: number;
  rothConversion: number;
  // healthcare
  acaCost: number;
  medicareCost: number;
  irmaaSurcharge: number;
  ltcExpected: number;
  // expenses
  expensesBase: number;
  expensesHealthcare: number;
  expensesTotal: number;
  // withdrawals (gross)
  withdrawTaxable: number;
  withdrawTraditional: number;
  withdrawRoth: number;
  withdrawHsa: number;
  // growth $ this year (sum of all buckets + real estate + others)
  growthTaxable: number;
  growthTraditional: number;
  growthRoth: number;
  growthHsa: number;
  growthRealEstate: number;
  growthOther: number;
  growthTotal: number;
  // taxes
  federalTax: number;
  stateTax: number;
  totalTax: number;
  effectiveRate: number;
  // balances at year end
  taxableBalance: number;
  taxableBasis: number;
  traditionalBalance: number;
  rothBalance: number;
  hsaBalance: number;
  realEstateValue: number;
  otherAssetsValue: number;
  estateValue: number;
  // alerts
  shortfall: number;
  // MAGI used for IRMAA
  magi: number;
};

type Buckets = {
  taxable: { balance: number; basis: number };
  traditional: number;
  roth: number;
  hsa: number;
};

function getReturn(asset: Asset, retired = false): number {
  switch (asset.category) {
    case "real-estate":
      return asset.appreciation;
    case "other":
      return asset.expectedReturn ?? asset.appreciation ?? 0;
    case "trad-401k":
    case "roth-401k":
    case "trad-ira":
    case "roth-ira":
    case "sep-ira":
    case "hsa":
    case "brokerage": {
      const tier = retired && asset.retirementTier ? asset.retirementTier : asset.tier;
      if (tier.tier === "custom" && tier.customMean !== undefined) {
        return tier.customMean;
      }
      return tierFor(tier.tier).mean;
    }
  }
}

function isTraditionalBucket(asset: Asset): boolean {
  return asset.category === "trad-401k" || asset.category === "trad-ira" || asset.category === "sep-ira";
}
function isRothBucket(asset: Asset): boolean {
  return asset.category === "roth-401k" || asset.category === "roth-ira";
}
function isHsaBucket(asset: Asset): boolean {
  return asset.category === "hsa";
}
function isTaxableBucket(asset: Asset): boolean {
  return asset.category === "brokerage";
}

/**
 * Build initial buckets from accumulated balances at retirement.
 * Real estate and "other" non-financial assets are tracked separately.
 */
function buildInitialBuckets(plan: Plan, balances: Record<string, number>, basisMap: Record<string, number>): {
  buckets: Buckets;
  realEstate: Map<string, { value: number; basis: number; remaining: typeof plan.assets[number] }>;
  others: Map<string, { value: number; basis: number; remaining: typeof plan.assets[number] }>;
} {
  const buckets: Buckets = {
    taxable: { balance: 0, basis: 0 },
    traditional: 0,
    roth: 0,
    hsa: 0,
  };
  const realEstate = new Map();
  const others = new Map();

  for (const asset of plan.assets) {
    const bal = balances[asset.id] ?? 0;
    const basis = basisMap[asset.id] ?? bal;
    if (asset.category === "real-estate") {
      realEstate.set(asset.id, { value: bal, basis, remaining: asset });
      continue;
    }
    if (asset.category === "other") {
      others.set(asset.id, { value: bal, basis, remaining: asset });
      continue;
    }
    if (isTaxableBucket(asset)) {
      buckets.taxable.balance += bal;
      buckets.taxable.basis += basis;
    } else if (isTraditionalBucket(asset)) {
      buckets.traditional += bal;
    } else if (isRothBucket(asset)) {
      buckets.roth += bal;
    } else if (isHsaBucket(asset)) {
      buckets.hsa += bal;
    }
  }
  return { buckets, realEstate, others };
}

/**
 * Returns the weighted-average return rate for each financial bucket.
 * `null` when the bucket has no assets (so callers can render "—" rather than the fallback).
 */
export function effectiveReturns(plan: Plan): {
  taxable: number | null;
  traditional: number | null;
  roth: number | null;
  hsa: number | null;
} {
  const has = (cat: "taxable" | "traditional" | "roth" | "hsa") => {
    for (const a of plan.assets) {
      if (cat === "taxable" && isTaxableBucket(a)) return true;
      if (cat === "traditional" && isTraditionalBucket(a)) return true;
      if (cat === "roth" && isRothBucket(a)) return true;
      if (cat === "hsa" && isHsaBucket(a)) return true;
    }
    return false;
  };
  return {
    taxable: has("taxable") ? weightedAvgReturn(plan, "taxable", true) : null,
    traditional: has("traditional") ? weightedAvgReturn(plan, "traditional", true) : null,
    roth: has("roth") ? weightedAvgReturn(plan, "roth", true) : null,
    hsa: has("hsa") ? weightedAvgReturn(plan, "hsa", true) : null,
  };
}

function weightedAvgReturn(
  plan: Plan,
  category: "taxable" | "traditional" | "roth" | "hsa",
  retired = false,
): number {
  let weighted = 0;
  let total = 0;
  let count = 0;
  let unweightedSum = 0;
  for (const asset of plan.assets) {
    if (
      (category === "taxable" && isTaxableBucket(asset)) ||
      (category === "traditional" && isTraditionalBucket(asset)) ||
      (category === "roth" && isRothBucket(asset)) ||
      (category === "hsa" && isHsaBucket(asset))
    ) {
      const ret = getReturn(asset, retired);
      weighted += ret * asset.balance;
      total += asset.balance;
      count++;
      unweightedSum += ret;
    }
  }
  // Balance-weighted when balances exist; otherwise simple average across the
  // bucket's accounts (e.g. user is contributing to a $0-balance IRA — the tier
  // they set should still drive the displayed/used rate, not a 7% fallback).
  if (total > 0) return weighted / total;
  if (count > 0) return unweightedSum / count;
  return 0.07;
}

export type ReturnSamples = {
  /** Year-indexed (0 = first projection year). Each entry: returns by bucket category and asset id. */
  byYear: Array<{
    taxable: number;
    traditional: number;
    roth: number;
    hsa: number;
    realEstate: Record<string, number>;
    others: Record<string, number>;
    inflation: number;
  }>;
};

/**
 * Year-by-year projection from current year through plan-to age of the longest-lived person.
 *
 * If `samples` is provided, each year uses those returns instead of the deterministic
 * weighted-average tier returns. Used by Monte Carlo simulation.
 */
export function projectPlan(plan: Plan, samples?: ReturnSamples): ProjectionRow[] {
  const { profile } = plan;
  const baseYear = profile.taxYear;
  const accum = accumulateToRetirement(plan);
  const { buckets, realEstate, others } = buildInitialBuckets(
    plan,
    accum.balanceByAsset,
    accum.basisByAsset,
  );

  const p1Born = profile.person1.birthYear;
  const p2Born = profile.person2?.birthYear ?? null;
  const p1Retire = profile.person1.retirementAge;
  const p2Retire = profile.person2?.retirementAge ?? null;
  const longevityP1 = profile.person1.longevityAge;
  const longevityP2 = profile.person2?.longevityAge ?? longevityP1;
  const longevityMax = Math.max(longevityP1, longevityP2);

  // Returns to compound buckets each year. Pre-retirement uses each asset's `tier`;
  // post-retirement uses `retirementTier` when set (glide path). We pre-compute both
  // weighted averages and pick per year.
  const retTaxablePre = weightedAvgReturn(plan, "taxable", false);
  const retTradPre = weightedAvgReturn(plan, "traditional", false);
  const retRothPre = weightedAvgReturn(plan, "roth", false);
  const retHsaPre = weightedAvgReturn(plan, "hsa", false);
  const retTaxablePost = weightedAvgReturn(plan, "taxable", true);
  const retTradPost = weightedAvgReturn(plan, "traditional", true);
  const retRothPost = weightedAvgReturn(plan, "roth", true);
  const retHsaPost = weightedAvgReturn(plan, "hsa", true);

  // Start projection at the earlier of the two retirement years.
  const p1RetireYear = baseYear + (p1Retire - (baseYear - p1Born));
  const p2RetireYear =
    p2Born !== null && p2Retire !== null
      ? baseYear + (p2Retire - (baseYear - p2Born))
      : null;
  const projectionStartYear =
    p2RetireYear !== null ? Math.min(p1RetireYear, p2RetireYear) : p1RetireYear;
  const projectionEndYear = baseYear + (longevityMax - (baseYear - p1Born));

  // Liquidations on retirement year — adjust buckets.
  const liquidatedThisYear = new Set<string>();

  // Track MAGI history for IRMAA 2-yr lookback.
  const magiByYear: Record<number, number> = {};

  // Death year (for survivor SS): assume p1 dies at 85 if couple, else not modeled.
  const p1DeathYear = profile.mode === "couple" ? baseYear + (85 - (baseYear - p1Born)) : null;

  const rows: ProjectionRow[] = [];

  let p1Survivor = false;
  let p2Survivor = false; // not used since we model p1 death only
  void p2Survivor;

  let yearIdx = 0;
  const filingStatus: FilingStatus = profile.filingStatus;
  const taxYr: TaxYear = profile.taxYear;

  for (let year = projectionStartYear; year <= projectionEndYear; year++, yearIdx++) {
    const p1Age = year - p1Born;
    const p2Age = p2Born !== null ? year - p2Born : null;

    // Bucket growth (apply at start of year).
    let growthTaxable = 0;
    let growthTraditional = 0;
    let growthRoth = 0;
    let growthHsa = 0;
    let growthRealEstate = 0;
    let growthOther = 0;
    if (yearIdx > 0) {
      const sample = samples?.byYear[yearIdx];
      // Use post-retirement (de-risked) returns once p1 has retired.
      const isRetired = p1Age >= p1Retire;
      const yrTaxable = sample?.taxable ?? (isRetired ? retTaxablePost : retTaxablePre);
      const yrTrad = sample?.traditional ?? (isRetired ? retTradPost : retTradPre);
      const yrRoth = sample?.roth ?? (isRetired ? retRothPost : retRothPre);
      const yrHsa = sample?.hsa ?? (isRetired ? retHsaPost : retHsaPre);

      growthTaxable = buckets.taxable.balance * yrTaxable;
      buckets.taxable.balance += growthTaxable;
      // basis stays put (not affected by gains)
      growthTraditional = buckets.traditional * yrTrad;
      buckets.traditional += growthTraditional;
      growthRoth = buckets.roth * yrRoth;
      buckets.roth += growthRoth;
      growthHsa = buckets.hsa * yrHsa;
      buckets.hsa += growthHsa;
      // Real estate & other assets compound too
      for (const [, re] of realEstate) {
        if (!liquidatedThisYear.has(re.remaining.id)) {
          const id = re.remaining.id;
          const ret =
            sample?.realEstate[id] ??
            (re.remaining as Extract<Asset, { category: "real-estate" }>).appreciation;
          const delta = re.value * ret;
          growthRealEstate += delta;
          re.value += delta;
        }
      }
      for (const [, o] of others) {
        const id = o.remaining.id;
        const ret = sample?.others[id] ?? getReturn(o.remaining);
        const delta = o.value * ret;
        growthOther += delta;
        o.value += delta;
      }
    }

    // Overlap-year contributions: for couples with split retirement, the still-working
    // spouse keeps contributing to their accounts during years one spouse has retired
    // and the other hasn't. accumulateToRetirement stops at projectionStartYear, so we
    // top up here. Added after this year's growth (slight under-count for the year
    // contributed; balances out across years).
    //
    // Also accumulate deductibleOverlap so trad-401k/HSA/etc. contributions reduce the
    // wages flowing to the tax engine (real-world W-2 / above-the-line behavior).
    let deductibleOverlap = 0;
    for (const asset of plan.assets) {
      const ownerRetireY = ownerRetireYearFor(asset, p1RetireYear, p2RetireYear);
      if (year >= ownerRetireY) continue;
      const contribution = preRetirementContribution(asset, year, accum.salaryByYear);
      if (contribution === 0) continue;
      switch (asset.category) {
        case "trad-401k":
        case "trad-ira":
        case "sep-ira":
          buckets.traditional += contribution;
          deductibleOverlap += contribution;
          break;
        case "roth-401k":
        case "roth-ira":
          buckets.roth += contribution;
          break;
        case "hsa":
          buckets.hsa += contribution;
          deductibleOverlap += contribution;
          break;
        case "brokerage":
          buckets.taxable.balance += contribution;
          buckets.taxable.basis += contribution;
          break;
      }
    }

    // Helper: liquidate one real-estate property. Returns the LTCG gain (after Section 121 if primary).
    const liquidateOne = (
      id: string,
      re: { value: number; basis: number; remaining: typeof plan.assets[number] },
    ): { gain: number; isIdaho: boolean } => {
      const a = re.remaining as Extract<Asset, { category: "real-estate" }>;
      const proceeds = re.value - a.mortgageBalance;
      let gain = re.value - re.basis;
      if (a.subtype === "primary") {
        gain = Math.max(0, gain - SECTION_121_EXCLUSION[filingStatus]);
      }
      buckets.taxable.balance += proceeds;
      buckets.taxable.basis += proceeds;
      liquidatedThisYear.add(id);
      re.value = 0;
      return { gain, isIdaho: profile.state === "ID" };
    };

    // Scheduled liquidations: at-retirement (legacy "liquidate") + new "liquidate-at-age".
    let liquidationGains = 0;
    let idahoPropertyGains = 0;
    for (const [id, re] of realEstate) {
      if (liquidatedThisYear.has(id)) continue;
      const a = re.remaining as Extract<Asset, { category: "real-estate" }>;
      const ownerRetireYear =
        a.owner === "p2" && p2RetireYear !== null ? p2RetireYear : p1RetireYear;
      const ownerAge = a.owner === "p2" && p2Age !== null ? p2Age : p1Age;
      const fireAtRetirement =
        year === ownerRetireYear && a.actionAtRetirement === "liquidate";
      const fireAtAge =
        a.actionAtRetirement === "liquidate-at-age" &&
        a.liquidateAtAge !== undefined &&
        ownerAge === a.liquidateAtAge;
      if (fireAtRetirement || fireAtAge) {
        const { gain, isIdaho } = liquidateOne(id, re);
        liquidationGains += gain;
        if (isIdaho) idahoPropertyGains += gain;
      }
    }

    // Wages (still working before retirement age).
    let wages = 0;
    if (p1Age < p1Retire) wages += accum.salaryByYear.p1[year] ?? 0;
    if (p2Age !== null && p2Retire !== null && p2Age < p2Retire) {
      wages += accum.salaryByYear.p2[year] ?? 0;
    }

    // Social Security benefits this year.
    let ss1 = computeSsBenefit({
      person: { pia: plan.socialSecurity.person1.pia, birthYear: p1Born },
      claimAge: plan.socialSecurity.person1.claimAge,
      currentAge: p1Age,
      yearsSinceBase: yearIdx,
      cola: SS.cola2026,
      isSurvivor: p1Survivor,
      deceasedBenefit: 0,
    });
    let ss2 = 0;
    if (p2Born !== null && plan.socialSecurity.person2) {
      ss2 = computeSsBenefit({
        person: { pia: plan.socialSecurity.person2.pia, birthYear: p2Born },
        claimAge: plan.socialSecurity.person2.claimAge,
        currentAge: p2Age!,
        yearsSinceBase: yearIdx,
        cola: SS.cola2026,
        isSurvivor: false,
        deceasedBenefit: 0,
      });
    }

    // Earnings test on SS if claimed early and still working.
    if (wages > 0 && ss1 > 0) {
      const wh = earningsTestWithholding({
        wages: wages,
        ageMonthsAtYearStart: p1Age * 12,
        birthYear: p1Born,
      });
      ss1 = Math.max(0, ss1 - wh);
    }

    // Survivor: when p1 dies, p2 collects max(own, p1's deceased benefit).
    if (p1DeathYear !== null && year > p1DeathYear) {
      // p1 gone; p2 may gain survivor benefit.
      const deceased = ss1; // p1 benefit at death
      ss1 = 0;
      if (ss2 < deceased) ss2 = deceased;
      p1Survivor = true;
    }

    // Pensions, annuities, rental net.
    let pensions = 0;
    let annuities = 0;
    let rentalNet = 0;
    for (const [, re] of realEstate) {
      if (liquidatedThisYear.has(re.remaining.id)) continue;
      const a = re.remaining as Extract<Asset, { category: "real-estate" }>;
      if (a.subtype === "rental" || a.subtype === "vacation") {
        const months = (a.monthlyRentIncome - a.monthlyRentExpense) * 12;
        rentalNet += months * Math.pow(1 + profile.inflation, yearIdx);
      }
    }
    for (const [, o] of others) {
      const a = o.remaining as Extract<Asset, { category: "other" }>;
      if (!a.startAge || !a.monthlyBenefit) continue;
      const ownerAge =
        a.owner === "p2" && p2Age !== null ? p2Age : p1Age;
      if (ownerAge < a.startAge) continue;
      const yearsSinceStart = ownerAge - a.startAge;
      const cola = a.cola ?? 0;
      const monthly = a.monthlyBenefit * Math.pow(1 + cola, yearsSinceStart);
      const annual = monthly * 12;
      if (a.subtype === "pension") pensions += annual;
      else if (a.subtype === "annuity") annuities += annual;
    }

    // Income streams (user-defined), split by their tax treatment.
    let partTime = 0; // ordinary-income streams + partial-ss bucket
    let streamsLtcg = 0;
    let streamsTaxFree = 0;
    for (const stream of plan.incomeStreams) {
      const ownerAge =
        stream.owner === "p2" && p2Age !== null ? p2Age : p1Age;
      if (ownerAge < stream.startAge) continue;
      if (stream.endAge !== null && ownerAge > stream.endAge) continue;
      const growth = stream.growth || profile.inflation;
      const yearsSinceStart = ownerAge - stream.startAge;
      const annual = stream.monthlyAmount * 12 * Math.pow(1 + growth, yearsSinceStart);
      switch (stream.taxability) {
        case "ltcg":
          streamsLtcg += annual;
          break;
        case "tax-free":
          streamsTaxFree += annual;
          break;
        case "partial-ss":
          // Treat 85% as ordinary; 15% tax-free. A simplification of SS-style treatment.
          partTime += annual * 0.85;
          streamsTaxFree += annual * 0.15;
          break;
        case "ordinary":
        default:
          partTime += annual;
          break;
      }
    }

    // RMDs
    const rmdP1 = computeRmd({
      priorYearEndBalance: buckets.traditional, // approximation: only one traditional bucket
      ownerAgeAtYearEnd: p1Age,
      ownerBirthYear: p1Born,
    });
    let rmdP2 = 0;
    if (p2Born !== null && p2Age !== null) {
      // We don't separate per-owner traditional balances; for now charge p2 RMD off the same pool.
      // This is an approximation; per-owner pooling can come later.
      rmdP2 = computeRmd({
        priorYearEndBalance: 0,
        ownerAgeAtYearEnd: p2Age,
        ownerBirthYear: p2Born,
      });
    }
    const rmdTotal = Math.min(rmdP1 + rmdP2, buckets.traditional);
    buckets.traditional -= rmdTotal;
    // RMDs land in taxable as net-of-tax cash; we'll treat them as ordinary income in withdraw.
    // The withdraw routine handles this.

    // Roth conversion (rule-driven, simplified: convert a fixed amount per year if in window).
    let rothConversion = 0;
    const rule = plan.options.rothConversionRule;
    if (rule.enabled && p1Age >= rule.startAge && p1Age <= rule.endAge) {
      // Convert up to ~$30k/year as a simple implementation.
      // A more sophisticated version would compute the exact bracket fill.
      const convert = Math.min(30_000, buckets.traditional);
      buckets.traditional -= convert;
      buckets.roth += convert;
      rothConversion = convert;
    }

    // Healthcare costs.
    const peopleCount = profile.mode === "couple" ? 2 : 1;
    let acaCost = 0;
    let medicareCost = 0;
    let irmaaSurcharge = 0;

    const lookbackMagi = magiByYear[year - 2] ?? wages + (rmdP1 + rmdP2);
    if (p1Age >= 65 || (p2Age !== null && p2Age >= 65)) {
      const medCovered = (p1Age >= 65 ? 1 : 0) + ((p2Age ?? 0) >= 65 ? 1 : 0);
      medicareCost = medCovered * annualMedicareBase({ year, includeMedigap: plan.healthcare.medigap });
      const irmaa = annualIrmaaCost({
        magiTwoYearsPrior: lookbackMagi,
        year,
        filingStatus,
      });
      // The "annual" already includes the standard premium in tier 1; for non-tier-1, surcharge = annual - tier1.
      const tier1Annual = 12 * (202.90 + 0); // approximate base reference
      irmaaSurcharge = Math.max(0, irmaa.annual - tier1Annual) * medCovered;
    }
    if (p1Age < 65 && p1Age >= p1Retire) {
      const aca = annualAcaCost({
        tier: plan.healthcare.acaTier,
        people: peopleCount as 1 | 2,
        year,
        magi: lookbackMagi,
      });
      acaCost = aca.net;
    }

    const ltcExpected = plan.healthcare.ltc.enabled
      ? expectedLtcAnnualCost({
          year,
          probability: plan.healthcare.ltc.probability,
          annualCost: plan.healthcare.ltc.annualCost,
          durationYears: plan.healthcare.ltc.durationYears,
          spreadOverYears: longevityMax - p1Retire,
        })
      : 0;

    // Expenses
    const expensesBase = computeExpenses(plan, p1Age, yearIdx, profile.inflation);
    const expensesHealthcare = acaCost + medicareCost + irmaaSurcharge + ltcExpected;
    const expensesTotal = expensesBase + expensesHealthcare;

    // Tax-free income streams reduce the net spend target directly (1:1, no tax).
    const adjustedSpend = Math.max(0, expensesTotal - streamsTaxFree);

    // Sell-when-needed properties available, sorted by priority (low number first; primary last by default).
    // withdrawForSpend does not mutate the input buckets (it spreads them), so we can safely re-run
    // it after a liquidation to recompute the shortfall against the larger taxable balance.
    const defaultPriority = (sub: "primary" | "vacation" | "rental"): number =>
      sub === "rental" ? 1 : sub === "vacation" ? 2 : 3;
    const sellQueue = Array.from(realEstate.entries())
      .filter(([id, re]) => {
        if (liquidatedThisYear.has(id)) return false;
        const a = re.remaining as Extract<Asset, { category: "real-estate" }>;
        return a.actionAtRetirement === "sell-when-needed";
      })
      .sort(([, a], [, b]) => {
        const aA = a.remaining as Extract<Asset, { category: "real-estate" }>;
        const bA = b.remaining as Extract<Asset, { category: "real-estate" }>;
        return (aA.sellPriority ?? defaultPriority(aA.subtype)) -
          (bA.sellPriority ?? defaultPriority(bA.subtype));
      });

    // Deductible contributions reduce taxable wages (trad-401k / HSA via W-2; trad-IRA / SEP via 1040 deduction).
    const taxableWages = Math.max(0, wages - deductibleOverlap);

    const runWithdraw = () =>
      withdrawForSpend({
        targetNetSpend: adjustedSpend,
        income: {
          wages: taxableWages,
          ordinaryIncome: pensions + annuities + rentalNet + partTime,
          rmdIncome: rmdTotal,
          socialSecurity: ss1 + ss2,
          rothConversion,
          forcedLongTermGains: liquidationGains + streamsLtcg,
          qualifiedDividends: 0,
          idahoPropertyGains,
          qualifiedMedicalSpend: Math.min(plan.healthcare.medigap ? 0 : medicareCost, buckets.hsa),
        },
        buckets,
        filingStatus,
        state: profile.state,
        year: taxYr,
      });

    let w = runWithdraw();

    // If shortfall, try liquidating one sell-when-needed property at a time and re-run.
    while (w.shortfall > 0 && sellQueue.length > 0) {
      const [id, re] = sellQueue.shift()!;
      const { gain, isIdaho } = liquidateOne(id, re);
      liquidationGains += gain;
      if (isIdaho) idahoPropertyGains += gain;
      w = runWithdraw();
    }

    // Apply withdrawal results to buckets.
    Object.assign(buckets, w.buckets);
    magiByYear[year] = w.magi;

    const realEstateValue = sumRealEstate(realEstate);
    const otherAssetsValue = sumOthers(others);
    const estateValue =
      buckets.taxable.balance +
      buckets.traditional +
      buckets.roth +
      buckets.hsa +
      realEstateValue +
      otherAssetsValue;

    rows.push({
      year,
      p1Age,
      p2Age,
      wages,
      ssP1: ss1,
      ssP2: ss2,
      pensions,
      annuities,
      rentalNet,
      partTime,
      rmdTotal,
      rothConversion,
      acaCost,
      medicareCost,
      irmaaSurcharge,
      ltcExpected,
      expensesBase,
      expensesHealthcare,
      expensesTotal,
      withdrawTaxable: w.grossWithdrawn.taxable,
      withdrawTraditional: w.grossWithdrawn.traditional,
      withdrawRoth: w.grossWithdrawn.roth,
      withdrawHsa: w.grossWithdrawn.hsa,
      growthTaxable,
      growthTraditional,
      growthRoth,
      growthHsa,
      growthRealEstate,
      growthOther,
      growthTotal:
        growthTaxable +
        growthTraditional +
        growthRoth +
        growthHsa +
        growthRealEstate +
        growthOther,
      federalTax: w.taxes.federal,
      stateTax: w.taxes.state,
      totalTax: w.taxes.total,
      effectiveRate: w.taxes.effectiveRate,
      taxableBalance: buckets.taxable.balance,
      taxableBasis: buckets.taxable.basis,
      traditionalBalance: buckets.traditional,
      rothBalance: buckets.roth,
      hsaBalance: buckets.hsa,
      realEstateValue,
      otherAssetsValue,
      estateValue,
      shortfall: w.shortfall,
      magi: w.magi,
    });
  }

  return rows;
}

function computeSsBenefit(args: {
  person: { pia: number; birthYear: number };
  claimAge: number;
  currentAge: number;
  yearsSinceBase: number;
  cola: number;
  isSurvivor: boolean;
  deceasedBenefit: number;
}): number {
  if (args.currentAge < args.claimAge) return 0;
  const monthlyAtClaim = benefitAtClaimAge({
    pia: args.person.pia,
    claimAgeMonths: args.claimAge * 12,
    birthYear: args.person.birthYear,
  });
  const yearsSinceClaim = Math.max(0, args.currentAge - args.claimAge);
  const monthlyNow = monthlyAtClaim * Math.pow(1 + args.cola, yearsSinceClaim);
  let annual = monthlyNow * 12;
  if (args.isSurvivor && args.deceasedBenefit > annual) annual = args.deceasedBenefit;
  return annual;
}

/**
 * Returns the year through which `asset` accepts contributions:
 * - p1-owned: p1's retire year.
 * - p2-owned: p2's retire year (falls back to p1 in single mode).
 * - joint-owned: later of the two — joint accounts can be funded by whichever spouse still earns.
 */
function ownerRetireYearFor(
  asset: Asset,
  p1RetireYear: number,
  p2RetireYear: number | null,
): number {
  if (asset.owner === "p2" && p2RetireYear !== null) return p2RetireYear;
  if (asset.owner === "joint" && p2RetireYear !== null) {
    return Math.max(p1RetireYear, p2RetireYear);
  }
  return p1RetireYear;
}

/**
 * Annual contribution to an investable asset for a given year, mirroring the
 * accumulation-phase logic in growth.ts. Used by projection.ts to credit the
 * still-working spouse during split-retirement overlap years.
 */
function preRetirementContribution(
  asset: Asset,
  year: number,
  salaryByYear: { p1: Record<number, number>; p2: Record<number, number> },
): number {
  switch (asset.category) {
    case "trad-401k":
    case "roth-401k": {
      const ownerSalary =
        asset.owner === "p2" ? salaryByYear.p2[year] ?? 0 : salaryByYear.p1[year] ?? 0;
      return (
        ownerSalary * ((asset.contributionPct ?? 0) + (asset.employerMatchPct ?? 0))
      );
    }
    case "trad-ira":
    case "roth-ira":
    case "sep-ira":
    case "hsa":
      return asset.annualContribution ?? 0;
    case "brokerage":
      return (asset.monthlyContribution ?? 0) * 12;
    default:
      return 0;
  }
}

function computeExpenses(
  plan: Plan,
  p1Age: number,
  yearIdx: number,
  inflation: number,
): number {
  let total = 0;
  const retireAge = plan.profile.person1.retirementAge;
  for (const e of plan.expenses) {
    const startAge = e.startAge ?? retireAge;
    const endAge = e.endAge ?? plan.profile.person1.longevityAge;
    if (p1Age < startAge || p1Age > endAge) continue;
    if (e.phaseOutAtAge !== null && p1Age >= e.phaseOutAtAge) continue;
    const growth = e.growth || inflation;
    let monthly = e.monthlyToday * Math.pow(1 + growth, yearIdx);
    if (e.stepChange !== null && p1Age >= e.stepChange.atAge) {
      monthly *= e.stepChange.multiplier;
    }
    total += monthly * 12;
  }
  return total;
}

function sumRealEstate(map: Map<string, { value: number }>): number {
  let s = 0;
  for (const [, v] of map) s += v.value;
  return s;
}
function sumOthers(map: Map<string, { value: number }>): number {
  let s = 0;
  for (const [, v] of map) s += v.value;
  return s;
}

// silence unused
void fraMonths;
