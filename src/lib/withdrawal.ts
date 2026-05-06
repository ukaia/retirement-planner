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

      if (Math.abs(netGained) < 0.5 || remainingSpend <= 0) break;
    }
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
