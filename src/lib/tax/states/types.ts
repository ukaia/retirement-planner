import type { FilingStatus, TaxYear } from "../../tax-constants";

export type StateCode = "AK" | "WA" | "OR" | "ID";

/**
 * Income mix supplied to a state tax module. All amounts are pre-tax annual.
 */
export type StateIncomeMix = {
  wages: number;
  ordinaryRetirement: number; // taxable IRA/401k withdrawals, conversions, RMDs, pensions, annuities
  socialSecurity: number; // gross SS benefits
  longTermGains: number;
  qualifiedDividends: number;
  shortTermGains: number;
  /** Federal income tax paid (used by Oregon's federal tax subtraction). */
  federalIncomeTaxPaid: number;
  /** Whether the LTCG arose from Idaho property (60% deduction). */
  idahoPropertyGains?: number;
};

export type StateTaxResult = {
  total: number;
  notes?: string[];
};

export type StateTaxModule = {
  code: StateCode;
  name: string;
  taxesSocialSecurity: boolean;
  /** Compute total state income tax for a given year and filing status. */
  computeTax: (args: {
    income: StateIncomeMix;
    filingStatus: FilingStatus;
    year: TaxYear;
  }) => StateTaxResult;
  /** State estate tax above an exemption, if any. Returns 0 if none. */
  estateTax: (args: { estateValue: number; year: TaxYear }) => number;
  notes: string[];
};
