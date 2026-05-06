import { bracketTax } from "../federal";
import type { TaxBracket, FilingStatus } from "../../tax-constants";
import type { StateTaxModule } from "./types";

// Oregon brackets (2026), per spec.
// Singles / MFS use the rates and thresholds shown; MFJ / HoH / QSS double thresholds.
const OR_RATES: TaxBracket[] = [
  { rate: 0.0475, upTo: 4_050 },
  { rate: 0.0675, upTo: 10_200 },
  { rate: 0.0875, upTo: 125_000 },
  { rate: 0.099, upTo: Infinity },
];

function bracketsFor(filingStatus: FilingStatus): TaxBracket[] {
  const isJoint =
    filingStatus === "mfj" ||
    filingStatus === "qss" ||
    filingStatus === "hoh";
  const factor = isJoint ? 2 : 1;
  return OR_RATES.map((b) => ({
    rate: b.rate,
    upTo: b.upTo === Infinity ? Infinity : b.upTo * factor,
  }));
}

// Standard deduction approximations from spec (verify with Pub 150-206-436 2026 edition).
// TODO(verify-2026): Oregon Pub 150-206-436 2026 standard deduction
const OR_STD_DED_2026: Record<FilingStatus, number> = {
  single: 2_420,
  mfs: 2_420,
  hoh: 4_840,
  mfj: 4_840,
  qss: 4_840,
};
const OR_STD_DED_2025: Record<FilingStatus, number> = {
  single: 2_420, // approximate
  mfs: 2_420,
  hoh: 4_840,
  mfj: 4_840,
  qss: 4_840,
};

// Federal tax subtraction: up to $8,750 (2026), phases out above $145k single / $290k MFJ.
// TODO(verify-2026): Oregon DOR exact phase-out 2026
const OR_FED_SUBTRACT_CAP_2026 = 8_750;
const OR_FED_SUBTRACT_PHASEOUT_SINGLE = 145_000;
const OR_FED_SUBTRACT_PHASEOUT_MFJ = 290_000;

function federalSubtraction(args: {
  agi: number;
  federalTaxPaid: number;
  filingStatus: FilingStatus;
}): number {
  const phaseStart =
    args.filingStatus === "mfj" ||
    args.filingStatus === "qss" ||
    args.filingStatus === "hoh"
      ? OR_FED_SUBTRACT_PHASEOUT_MFJ
      : OR_FED_SUBTRACT_PHASEOUT_SINGLE;

  // Linear phaseout over a $5k window above the threshold (approximate per OR DOR).
  const phaseEnd = phaseStart + 5_000;
  const cap = OR_FED_SUBTRACT_CAP_2026;
  let allowed = Math.min(args.federalTaxPaid, cap);
  if (args.agi > phaseStart) {
    const t = Math.min(1, (args.agi - phaseStart) / (phaseEnd - phaseStart));
    allowed *= 1 - t;
  }
  return Math.max(0, allowed);
}

export const oregon: StateTaxModule = {
  code: "OR",
  name: "Oregon",
  taxesSocialSecurity: false, // Oregon does not tax SS benefits.
  computeTax: ({ income, filingStatus, year }) => {
    // Oregon taxable income: wages + ordinary retirement + capital gains taxed as ordinary.
    // Excludes Social Security. Does not give preferential LTCG rate (taxed as ordinary).
    const grossOR =
      income.wages +
      income.ordinaryRetirement +
      income.longTermGains +
      income.qualifiedDividends +
      income.shortTermGains;

    const std = year === 2026 ? OR_STD_DED_2026[filingStatus] : OR_STD_DED_2025[filingStatus];

    // Federal tax subtraction (limited).
    const fedSub = federalSubtraction({
      agi: grossOR,
      federalTaxPaid: income.federalIncomeTaxPaid,
      filingStatus,
    });

    const taxable = Math.max(0, grossOR - std - fedSub);
    const brackets = bracketsFor(filingStatus);
    const tax = bracketTax(taxable, brackets);

    return {
      total: tax,
      notes: [
        "Oregon does not tax Social Security.",
        "Capital gains taxed as ordinary income (no preferential rate).",
        `Federal tax subtraction: $${Math.round(fedSub).toLocaleString()}.`,
      ],
    };
  },
  estateTax: ({ estateValue }) => {
    // Oregon estate tax: starts at $1M exemption, rates 10-16%.
    // Simplified flat 10% on amount above $1M for now.
    const taxable = Math.max(0, estateValue - 1_000_000);
    return taxable * 0.10;
  },
  notes: [
    "Progressive 4.75% / 6.75% / 8.75% / 9.9%.",
    "Does not tax Social Security or Tier I Railroad Retirement.",
    "Federal tax subtraction up to ~$8,750 (2026), phased out at higher incomes.",
    "State estate tax begins at $1M exemption.",
  ],
};
