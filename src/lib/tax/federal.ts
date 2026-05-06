import {
  FED_BRACKETS,
  FICA,
  LTCG_BRACKETS,
  NIIT_RATE,
  NIIT_THRESHOLDS,
  STANDARD_DEDUCTION,
  type FilingStatus,
  type TaxBracket,
  type TaxYear,
} from "../tax-constants";

// Apply marginal brackets to taxable income.
export function bracketTax(taxable: number, brackets: TaxBracket[]): number {
  if (taxable <= 0) return 0;
  let prev = 0;
  let tax = 0;
  for (const b of brackets) {
    const slice = Math.max(0, Math.min(taxable, b.upTo) - prev);
    tax += slice * b.rate;
    if (taxable <= b.upTo) break;
    prev = b.upTo;
  }
  return tax;
}

export type FederalIncomeTaxArgs = {
  /** Wages, taxable IRA/401k withdrawals, taxable SS, pension, RMDs, conversions, etc. */
  ordinaryIncome: number;
  /** Net long-term capital gains (taxable). */
  longTermGains?: number;
  /** Net qualified dividends, treated like LTCG for federal. */
  qualifiedDividends?: number;
  filingStatus: FilingStatus;
  year: TaxYear;
  /** Override standard deduction (e.g., if itemizing). */
  deduction?: number;
};

export type FederalIncomeTaxResult = {
  ordinaryTax: number;
  ltcgTax: number;
  niit: number;
  total: number;
  taxableOrdinary: number;
  taxableGains: number;
};

/**
 * Federal income tax including ordinary brackets, LTCG stacking, and NIIT.
 * The LTCG calc follows the standard "qualified dividends and LTCG worksheet"
 * approach: ordinary income fills brackets first; LTCG sits on top.
 */
export function federalIncomeTax(args: FederalIncomeTaxArgs): FederalIncomeTaxResult {
  const { ordinaryIncome, filingStatus, year } = args;
  const longTermGains = args.longTermGains ?? 0;
  const qualifiedDividends = args.qualifiedDividends ?? 0;
  const totalGains = longTermGains + qualifiedDividends;

  const stdDed = args.deduction ?? STANDARD_DEDUCTION[year][filingStatus];
  const grossTotal = ordinaryIncome + totalGains;
  const taxableTotal = Math.max(0, grossTotal - stdDed);

  // Ordinary portion: deduction reduces ordinary income first, then gains.
  const taxableOrdinary = Math.max(0, ordinaryIncome - stdDed);
  const taxableGains = Math.max(0, taxableTotal - taxableOrdinary);

  const ordinaryTax = bracketTax(taxableOrdinary, FED_BRACKETS[year][filingStatus]);

  // LTCG stacking: the gain bracket cutoffs apply to total taxable income,
  // but only the gains themselves are taxed at LTCG rates.
  const ltcg = LTCG_BRACKETS[year][filingStatus];
  let ltcgTax = 0;
  if (taxableGains > 0) {
    let remainingGains = taxableGains;
    let stackTop = taxableOrdinary;

    // 0% portion
    const room0 = Math.max(0, ltcg.zeroUpTo - stackTop);
    const at0 = Math.min(remainingGains, room0);
    remainingGains -= at0;
    stackTop += at0;

    // 15% portion
    const room15 = Math.max(0, ltcg.fifteenUpTo - stackTop);
    const at15 = Math.min(remainingGains, room15);
    ltcgTax += at15 * 0.15;
    remainingGains -= at15;
    stackTop += at15;

    // 20% portion
    const at20 = remainingGains;
    ltcgTax += at20 * 0.20;
  }

  // NIIT applies to investment income (gains + qualified divs) when MAGI is over threshold.
  // We approximate MAGI as gross total income.
  const niit = niitTax({
    investmentIncome: totalGains,
    magi: grossTotal,
    filingStatus,
  });

  const total = ordinaryTax + ltcgTax + niit;
  return { ordinaryTax, ltcgTax, niit, total, taxableOrdinary, taxableGains };
}

export function niitTax(args: {
  investmentIncome: number;
  magi: number;
  filingStatus: FilingStatus;
}): number {
  const threshold = NIIT_THRESHOLDS[args.filingStatus];
  const excess = Math.max(0, args.magi - threshold);
  const taxable = Math.min(args.investmentIncome, excess);
  return Math.max(0, taxable) * NIIT_RATE;
}

export type FicaResult = {
  socialSecurity: number;
  medicare: number;
  addlMedicare: number;
  total: number;
};

/**
 * Employee-side FICA on wages.
 * - Social Security: 6.2% on wages up to the wage base.
 * - Medicare: 1.45% uncapped.
 * - Additional Medicare: 0.9% on wages above filing-status threshold.
 */
export function ficaTax(args: {
  wages: number;
  filingStatus: FilingStatus;
  year: TaxYear;
}): FicaResult {
  const f = FICA[args.year];
  const ss = Math.min(args.wages, f.ssWageBase) * f.ssRateEmployee;
  const med = args.wages * f.medicareRate;
  const addl =
    Math.max(0, args.wages - f.addlMedicareThreshold[args.filingStatus]) *
    f.addlMedicareRate;
  return { socialSecurity: ss, medicare: med, addlMedicare: addl, total: ss + med + addl };
}

/**
 * How much of Social Security benefits are federally taxable, given other income.
 * Simplified per spec: up to 85% taxable. Uses the IRS-style provisional income test
 * for the stair-step.
 */
export function ssTaxablePortion(args: {
  ssBenefits: number;
  otherOrdinaryIncome: number;
  taxExemptInterest?: number;
  filingStatus: FilingStatus;
}): number {
  const provisional =
    args.otherOrdinaryIncome +
    (args.taxExemptInterest ?? 0) +
    args.ssBenefits * 0.5;

  const isJoint = args.filingStatus === "mfj" || args.filingStatus === "qss";
  const lowerBase = isJoint ? 32_000 : 25_000;
  const upperBase = isJoint ? 44_000 : 34_000;

  if (provisional <= lowerBase) return 0;

  const aboveLower = Math.max(0, provisional - lowerBase);
  const aboveUpper = Math.max(0, provisional - upperBase);

  const tier1 = Math.min(aboveLower, upperBase - lowerBase) * 0.5;
  const tier2 = aboveUpper * 0.85;

  const cap = args.ssBenefits * 0.85;
  return Math.min(tier1 + tier2, cap);
}
