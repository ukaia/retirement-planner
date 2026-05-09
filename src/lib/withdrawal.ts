import { federalIncomeTax, ssTaxablePortion } from "./tax/federal";
import { stateTaxModule, type StateCode } from "./tax/states";
import type { FilingStatus, TaxYear } from "./tax-constants";
import type { StateIncomeMix } from "./tax/states/types";

/**
 * Year-end "buckets" representing balances available for withdrawal.
 * Pre-RMD reductions and forced income should be applied before passing in.
 */
export type WithdrawalBuckets = {
  taxable: { balance: number; basis: number };
  traditional: number;
  roth: number;
  hsa: number;
};

export type IncomeForYear = {
  /** Wages from part-time work or other ordinary income streams. */
  wages: number;
  /** Pension/annuity/rental ordinary income (taxed federally as ordinary). */
  ordinaryIncome: number;
  /** Already-taken RMDs for the year (forced ordinary income). */
  rmdIncome: number;
  /** Gross Social Security benefits. */
  socialSecurity: number;
  /** Roth conversions for the year (counted as ordinary income). */
  rothConversion: number;
  /** Long-term gains from forced events (e.g., real-estate liquidation). */
  forcedLongTermGains: number;
  /** Qualified dividends (rare to forecast separately; default 0). */
  qualifiedDividends: number;
  /** Idaho-property gains, for state-level deduction. */
  idahoPropertyGains: number;
  /** Healthcare costs that are "qualified" for tax-free HSA. */
  qualifiedMedicalSpend: number;
};

export type WithdrawalResult = {
  /** Net dollars made available to spend after taxes, by source. */
  bySource: {
    income: number; // guaranteed/RMD income net of tax-on-it (after sequencing)
    taxable: number;
    traditional: number;
    roth: number;
    hsa: number;
  };
  /** Gross dollars withdrawn from each account bucket. */
  grossWithdrawn: {
    taxable: number;
    taxableGains: number; // realized LTCG portion
    traditional: number;
    roth: number;
    hsa: number;
  };
  /** Updated buckets after the year's draws. */
  buckets: WithdrawalBuckets;
  /** Total federal + state + NIIT for the year. */
  taxes: {
    federal: number;
    state: number;
    total: number;
    /** Effective tax rate on gross income for the year. */
    effectiveRate: number;
  };
  /** AGI / MAGI proxy used for IRMAA lookback. */
  magi: number;
  /** True if there was a shortfall after exhausting all buckets. */
  shortfall: number;
  notes: string[];
};

/**
 * Compute taxes given a fully specified income mix.
 */
function taxForYear(args: {
  ordinaryIncome: number;
  longTermGains: number;
  qualifiedDividends: number;
  socialSecurity: number;
  filingStatus: FilingStatus;
  state: StateCode;
  year: TaxYear;
  stateIncomeMix: StateIncomeMix;
}): { fed: number; state: number; ssTaxable: number; total: number } {
  const ssTaxable = ssTaxablePortion({
    ssBenefits: args.socialSecurity,
    otherOrdinaryIncome: args.ordinaryIncome + args.longTermGains + args.qualifiedDividends,
    filingStatus: args.filingStatus,
  });
  const fedRes = federalIncomeTax({
    ordinaryIncome: args.ordinaryIncome + ssTaxable,
    longTermGains: args.longTermGains,
    qualifiedDividends: args.qualifiedDividends,
    filingStatus: args.filingStatus,
    year: args.year,
  });
  const stateRes = stateTaxModule(args.state).computeTax({
    income: { ...args.stateIncomeMix, federalIncomeTaxPaid: fedRes.total },
    filingStatus: args.filingStatus,
    year: args.year,
  });
  return {
    fed: fedRes.total,
    state: stateRes.total,
    ssTaxable,
    total: fedRes.total + stateRes.total,
  };
}

/**
 * Draw from buckets in the default tax-aware order to meet a target net spend.
 *
 * Strategy:
 *   1. HSA covers qualified medical spend tax-free up to balance.
 *   2. Forced/guaranteed income + RMDs come first; pay tax on those.
 *   3. If net shortfall remains: withdraw from taxable brokerage (gain portion is LTCG).
 *   4. Then traditional (ordinary income).
 *   5. Then Roth (tax-free).
 *
 * Iterates a few times to converge on tax-driven gross-up. This is approximate but
 * stable for plausible income/expense ranges.
 */
export function withdrawForSpend(args: {
  targetNetSpend: number;
  income: IncomeForYear;
  buckets: WithdrawalBuckets;
  filingStatus: FilingStatus;
  state: StateCode;
  year: TaxYear;
}): WithdrawalResult {
  const { targetNetSpend, income, year, filingStatus, state } = args;
  const buckets: WithdrawalBuckets = {
    taxable: { ...args.buckets.taxable },
    traditional: args.buckets.traditional,
    roth: args.buckets.roth,
    hsa: args.buckets.hsa,
  };

  // 1. HSA covers qualified medical (tax-free).
  const hsaUsed = Math.min(buckets.hsa, income.qualifiedMedicalSpend);
  buckets.hsa -= hsaUsed;
  let netCovered = hsaUsed;
  let remainingSpend = targetNetSpend - hsaUsed;

  // 2. Setup forced income.
  let ordinary =
    income.wages +
    income.ordinaryIncome +
    income.rmdIncome +
    income.rothConversion;
  let longTermGains = income.forcedLongTermGains;
  const qualifiedDividends = income.qualifiedDividends;

  let withdrawnTaxable = 0;
  let withdrawnTaxableGains = 0;
  let withdrawnTraditional = 0;
  let withdrawnRoth = 0;

  // Helper: realize taxable brokerage withdrawal of grossAmount.
  function drawFromTaxable(grossAmount: number): { net: number; gains: number } {
    if (buckets.taxable.balance <= 0 || grossAmount <= 0) return { net: 0, gains: 0 };
    const draw = Math.min(grossAmount, buckets.taxable.balance);
    const basisFraction = buckets.taxable.balance > 0
      ? buckets.taxable.basis / buckets.taxable.balance
      : 1;
    const gain = draw * (1 - basisFraction);
    const basisDraw = draw - gain;
    buckets.taxable.balance -= draw;
    buckets.taxable.basis -= basisDraw;
    withdrawnTaxable += draw;
    withdrawnTaxableGains += Math.max(0, gain);
    longTermGains += Math.max(0, gain);
    return { net: draw, gains: Math.max(0, gain) };
  }

  function drawFromTraditional(amount: number): number {
    if (buckets.traditional <= 0 || amount <= 0) return 0;
    const draw = Math.min(amount, buckets.traditional);
    buckets.traditional -= draw;
    withdrawnTraditional += draw;
    ordinary += draw;
    return draw;
  }

  function drawFromRoth(amount: number): number {
    if (buckets.roth <= 0 || amount <= 0) return 0;
    const draw = Math.min(amount, buckets.roth);
    buckets.roth -= draw;
    withdrawnRoth += draw;
    return draw;
  }

  // Refund helpers: reverse a portion of an already-recorded draw. Used to
  // correct gross-up overshoot — the draw estimator targets a net but the
  // realized marginal rate may be lower than the approxRate, so the iteration
  // can over-cover the spend target and leak cash that nothing actually pays for.
  function refundToTaxable(amount: number): void {
    if (amount <= 0 || withdrawnTaxable <= 0) return;
    const refund = Math.min(amount, withdrawnTaxable);
    // Refund proportionally by the realized gain fraction so basis tracking stays sane.
    const gainFraction =
      withdrawnTaxable > 0 ? withdrawnTaxableGains / withdrawnTaxable : 0;
    const refundGain = refund * gainFraction;
    const refundBasis = refund - refundGain;
    buckets.taxable.balance += refund;
    buckets.taxable.basis += refundBasis;
    withdrawnTaxable -= refund;
    withdrawnTaxableGains -= refundGain;
    longTermGains -= refundGain;
  }

  function refundToTraditional(amount: number): void {
    if (amount <= 0 || withdrawnTraditional <= 0) return;
    const refund = Math.min(amount, withdrawnTraditional);
    buckets.traditional += refund;
    withdrawnTraditional -= refund;
    ordinary -= refund;
  }

  function refundToRoth(amount: number): void {
    if (amount <= 0 || withdrawnRoth <= 0) return;
    const refund = Math.min(amount, withdrawnRoth);
    buckets.roth += refund;
    withdrawnRoth -= refund;
  }

  function currentTax(): { fed: number; state: number; total: number } {
    const stateMix: StateIncomeMix = {
      wages: income.wages,
      ordinaryRetirement:
        income.ordinaryIncome + income.rmdIncome + income.rothConversion + withdrawnTraditional,
      socialSecurity: income.socialSecurity,
      longTermGains: longTermGains,
      qualifiedDividends: qualifiedDividends,
      shortTermGains: 0,
      federalIncomeTaxPaid: 0,
      idahoPropertyGains: income.idahoPropertyGains,
    };
    const res = taxForYear({
      ordinaryIncome: ordinary,
      longTermGains,
      qualifiedDividends,
      socialSecurity: income.socialSecurity,
      filingStatus,
      state,
      year,
      stateIncomeMix: stateMix,
    });
    return { fed: res.fed, state: res.state, total: res.total };
  }

  // 3. Tax on existing forced income.
  let tax = currentTax();
  const incomeNet =
    income.wages +
    income.ordinaryIncome +
    income.rmdIncome +
    income.socialSecurity -
    tax.total;
  netCovered += Math.max(0, incomeNet);
  remainingSpend = Math.max(0, targetNetSpend - netCovered);

  // 4. Withdraw from buckets in order to cover remainingSpend, gross-up for tax.
  // We iterate per source up to a few times.
  const sources: Array<"taxable" | "traditional" | "roth"> = [
    "taxable",
    "traditional",
    "roth",
  ];

  for (const source of sources) {
    if (remainingSpend <= 0) break;
    for (let iter = 0; iter < 6; iter++) {
      const taxBefore = currentTax().total;

      // Estimate gross-up: divide net needed by (1 - effective marginal rate).
      // Roth: 0 tax. Taxable: LTCG rate proxy 0.15 + state. Traditional: federal marginal + state.
      let approxRate = 0;
      if (source === "taxable") approxRate = 0.18;
      else if (source === "traditional") approxRate = 0.27;
      const grossNeed = approxRate >= 1 ? remainingSpend : remainingSpend / (1 - approxRate);

      let drawn = 0;
      if (source === "taxable") drawn = drawFromTaxable(grossNeed).net;
      else if (source === "traditional") drawn = drawFromTraditional(grossNeed);
      else if (source === "roth") drawn = drawFromRoth(grossNeed);

      if (drawn <= 0) break; // bucket empty

      const taxAfter = currentTax().total;
      const taxDelta = taxAfter - taxBefore;
      const netGained = drawn - taxDelta;
      netCovered += netGained;
      remainingSpend = Math.max(0, targetNetSpend - netCovered);

      // Correct gross-up overshoot. If approxRate over-estimated tax, the draw
      // covered more net than needed — refund the surplus to the source bucket
      // and recompute. Iterates a few times because each refund changes the tax
      // bill, which in turn changes the precise overshoot.
      let overshoot = netCovered - targetNetSpend;
      for (let correction = 0; correction < 4 && overshoot > 0.5; correction++) {
        const marginal =
          drawn > 0 ? Math.min(0.99, Math.max(0, taxDelta / drawn)) : 0;
        const refundGross = marginal >= 1 ? overshoot : overshoot / (1 - marginal);
        const taxBeforeRefund = currentTax().total;
        if (source === "taxable") refundToTaxable(refundGross);
        else if (source === "traditional") refundToTraditional(refundGross);
        else if (source === "roth") refundToRoth(refundGross);
        const taxAfterRefund = currentTax().total;
        const netRefunded = refundGross - (taxBeforeRefund - taxAfterRefund);
        netCovered -= netRefunded;
        overshoot = netCovered - targetNetSpend;
      }
      remainingSpend = Math.max(0, targetNetSpend - netCovered);

      if (Math.abs(netGained) < 0.5 || remainingSpend <= 0) break;
    }
  }

  // Forced-income surplus: when wages / SS / pensions / rental / RMDs exceed
  // the spending target plus tax, the unspent net cash is real money the owner
  // would normally save. Re-deposit it to the taxable bucket as already-taxed
  // capital so the books balance and the surplus isn't lost mid-projection.
  const surplus = netCovered - targetNetSpend;
  if (surplus > 0.5) {
    buckets.taxable.balance += surplus;
    buckets.taxable.basis += surplus;
    netCovered = targetNetSpend;
  }

  // Final tax for the year
  tax = currentTax();
  const grossOrdinary =
    income.wages + income.ordinaryIncome + income.rmdIncome + income.socialSecurity;
  const totalGrossIncome = grossOrdinary + longTermGains + withdrawnRoth + withdrawnTaxable;
  const effectiveRate = totalGrossIncome > 0 ? tax.total / totalGrossIncome : 0;

  // MAGI proxy = ordinary + LTCG + 100% of SS (approximation).
  const magi = ordinary + longTermGains + income.socialSecurity + qualifiedDividends;

  const incomeNetFinal = Math.max(0, grossOrdinary - tax.total);

  return {
    bySource: {
      income: incomeNetFinal,
      taxable: Math.max(0, withdrawnTaxable - withdrawnTaxableGains * 0.15),
      traditional: Math.max(0, withdrawnTraditional * (1 - 0.27)),
      roth: withdrawnRoth,
      hsa: hsaUsed,
    },
    grossWithdrawn: {
      taxable: withdrawnTaxable,
      taxableGains: withdrawnTaxableGains,
      traditional: withdrawnTraditional,
      roth: withdrawnRoth,
      hsa: hsaUsed,
    },
    buckets,
    taxes: {
      federal: tax.fed,
      state: tax.state,
      total: tax.total,
      effectiveRate,
    },
    magi,
    shortfall: Math.max(0, targetNetSpend - netCovered),
    notes: [],
  };
}
