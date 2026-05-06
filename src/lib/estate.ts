import { ESTATE } from "./tax-constants";
import { stateTaxModule, type StateCode } from "./tax/states";

export type EstateInputs = {
  estateValue: number;
  filingStatus: "single" | "mfs" | "hoh" | "mfj" | "qss";
  state: StateCode;
  beneficiaries: number;
  year: 2025 | 2026;
};

export type EstateBreakdown = {
  federalExemption: number;
  federalEstateTax: number;
  stateEstateTax: number;
  netInheritance: number;
  perBeneficiary: number;
};

export function computeEstate(args: EstateInputs): EstateBreakdown {
  const isMfj = args.filingStatus === "mfj" || args.filingStatus === "qss";
  const fedExemption = isMfj ? ESTATE.federalExemption2026 * 2 : ESTATE.federalExemption2026;
  const fedTax = Math.max(0, args.estateValue - fedExemption) * ESTATE.federalRateAboveExemption;
  const stateTax = stateTaxModule(args.state).estateTax({
    estateValue: args.estateValue,
    year: args.year,
  });
  const net = Math.max(0, args.estateValue - fedTax - stateTax);
  const perBeneficiary = args.beneficiaries > 0 ? net / args.beneficiaries : net;
  return {
    federalExemption: fedExemption,
    federalEstateTax: fedTax,
    stateEstateTax: stateTax,
    netInheritance: net,
    perBeneficiary,
  };
}

/**
 * Estimate cumulative tax-free gifting over remaining life via the annual exclusion.
 */
export function gifting(args: {
  beneficiaries: number;
  yearsRemaining: number;
  giftSplit: boolean;
}): number {
  const perRecipient = args.giftSplit
    ? ESTATE.annualGiftExclusion2026 * 2
    : ESTATE.annualGiftExclusion2026;
  return perRecipient * args.beneficiaries * Math.max(0, args.yearsRemaining);
}
