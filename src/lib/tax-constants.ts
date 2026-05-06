// Tax constants for federal, FICA, retirement contributions, RMDs,
// Social Security, IRMAA, healthcare, and estate.
// All numeric values are USD. Sources are cited inline.
//
// Sources:
// - IRS Rev. Proc. 2024-40 (2025 brackets, deductions, LTCG)
// - IRS Rev. Proc. 2025-32 (2026 brackets, deductions, LTCG)
// - IRS Notice 2025-67 + IR-2025-111 (2026 retirement plan limits)
// - IRS Pub 590-B (Uniform Lifetime Table for RMDs)
// - SECURE 2.0 Act of 2022 (RMD age changes, mandatory Roth catch-up)
// - SSA 2026 COLA Fact Sheet (wage base, OASDI, COLA)
// - SSA Max Benefit FAQ (2026 max benefits at 62/FRA/70)
// - CMS 2026 Medicare Parts A & B Premiums and Deductibles fact sheet
// - IRC Section 121 (primary residence exclusion)
// - IRC Section 1250 (depreciation recapture)
// - IRC Section 2010 / OBBB Public Law 119-21 (2026 estate exemption $15M)

export type TaxYear = 2025 | 2026;
export type FilingStatus = "single" | "mfs" | "hoh" | "mfj" | "qss";

export type TaxBracket = { rate: number; upTo: number };

// ---------------------------------------------------------------------------
// 22.1 Federal Income Tax Brackets
// ---------------------------------------------------------------------------

const FED_BRACKETS_2025: Record<FilingStatus, TaxBracket[]> = {
  single: [
    { rate: 0.10, upTo: 11_925 },
    { rate: 0.12, upTo: 48_475 },
    { rate: 0.22, upTo: 103_350 },
    { rate: 0.24, upTo: 197_300 },
    { rate: 0.32, upTo: 250_525 },
    { rate: 0.35, upTo: 626_350 },
    { rate: 0.37, upTo: Infinity },
  ],
  mfs: [
    { rate: 0.10, upTo: 11_925 },
    { rate: 0.12, upTo: 48_475 },
    { rate: 0.22, upTo: 103_350 },
    { rate: 0.24, upTo: 197_300 },
    { rate: 0.32, upTo: 250_525 },
    { rate: 0.35, upTo: 375_800 },
    { rate: 0.37, upTo: Infinity },
  ],
  mfj: [
    { rate: 0.10, upTo: 23_850 },
    { rate: 0.12, upTo: 96_950 },
    { rate: 0.22, upTo: 206_700 },
    { rate: 0.24, upTo: 394_600 },
    { rate: 0.32, upTo: 501_050 },
    { rate: 0.35, upTo: 751_600 },
    { rate: 0.37, upTo: Infinity },
  ],
  qss: [
    { rate: 0.10, upTo: 23_850 },
    { rate: 0.12, upTo: 96_950 },
    { rate: 0.22, upTo: 206_700 },
    { rate: 0.24, upTo: 394_600 },
    { rate: 0.32, upTo: 501_050 },
    { rate: 0.35, upTo: 751_600 },
    { rate: 0.37, upTo: Infinity },
  ],
  hoh: [
    { rate: 0.10, upTo: 17_000 },
    { rate: 0.12, upTo: 64_850 },
    { rate: 0.22, upTo: 103_350 },
    { rate: 0.24, upTo: 197_300 },
    { rate: 0.32, upTo: 250_500 },
    { rate: 0.35, upTo: 626_350 },
    { rate: 0.37, upTo: Infinity },
  ],
};

const FED_BRACKETS_2026: Record<FilingStatus, TaxBracket[]> = {
  single: [
    { rate: 0.10, upTo: 12_400 },
    { rate: 0.12, upTo: 50_400 },
    { rate: 0.22, upTo: 105_700 },
    { rate: 0.24, upTo: 201_775 },
    { rate: 0.32, upTo: 256_225 },
    { rate: 0.35, upTo: 640_600 },
    { rate: 0.37, upTo: Infinity },
  ],
  mfs: [
    { rate: 0.10, upTo: 12_400 },
    { rate: 0.12, upTo: 50_400 },
    { rate: 0.22, upTo: 105_700 },
    { rate: 0.24, upTo: 201_775 },
    { rate: 0.32, upTo: 256_225 },
    { rate: 0.35, upTo: 384_350 },
    { rate: 0.37, upTo: Infinity },
  ],
  mfj: [
    { rate: 0.10, upTo: 24_800 },
    { rate: 0.12, upTo: 100_800 },
    { rate: 0.22, upTo: 211_400 },
    { rate: 0.24, upTo: 403_550 },
    { rate: 0.32, upTo: 512_450 },
    { rate: 0.35, upTo: 768_700 },
    { rate: 0.37, upTo: Infinity },
  ],
  qss: [
    { rate: 0.10, upTo: 24_800 },
    { rate: 0.12, upTo: 100_800 },
    { rate: 0.22, upTo: 211_400 },
    { rate: 0.24, upTo: 403_550 },
    { rate: 0.32, upTo: 512_450 },
    { rate: 0.35, upTo: 768_700 },
    { rate: 0.37, upTo: Infinity },
  ],
  hoh: [
    { rate: 0.10, upTo: 17_700 },
    { rate: 0.12, upTo: 67_450 },
    { rate: 0.22, upTo: 105_700 },
    { rate: 0.24, upTo: 201_775 },
    { rate: 0.32, upTo: 256_200 },
    { rate: 0.35, upTo: 640_600 },
    { rate: 0.37, upTo: Infinity },
  ],
};

export const FED_BRACKETS: Record<TaxYear, Record<FilingStatus, TaxBracket[]>> = {
  2025: FED_BRACKETS_2025,
  2026: FED_BRACKETS_2026,
};

// ---------------------------------------------------------------------------
// 22.2 Standard Deduction
// ---------------------------------------------------------------------------

export const STANDARD_DEDUCTION: Record<TaxYear, Record<FilingStatus, number>> = {
  2025: {
    single: 15_750,
    mfs: 15_750,
    mfj: 31_500,
    qss: 31_500,
    hoh: 23_625,
  },
  2026: {
    single: 16_100,
    mfs: 16_100,
    mfj: 32_200,
    qss: 32_200,
    hoh: 24_150,
  },
};

// ---------------------------------------------------------------------------
// 22.3 Long-Term Capital Gains
// ---------------------------------------------------------------------------

export type LTCGBrackets = {
  zeroUpTo: number;
  fifteenUpTo: number;
};

export const LTCG_BRACKETS: Record<TaxYear, Record<FilingStatus, LTCGBrackets>> = {
  2025: {
    single: { zeroUpTo: 48_350, fifteenUpTo: 533_400 },
    mfs: { zeroUpTo: 48_350, fifteenUpTo: 300_000 },
    mfj: { zeroUpTo: 96_700, fifteenUpTo: 600_050 },
    qss: { zeroUpTo: 96_700, fifteenUpTo: 600_050 },
    hoh: { zeroUpTo: 64_750, fifteenUpTo: 566_700 },
  },
  2026: {
    single: { zeroUpTo: 49_450, fifteenUpTo: 545_500 },
    mfs: { zeroUpTo: 49_450, fifteenUpTo: 306_850 },
    mfj: { zeroUpTo: 98_900, fifteenUpTo: 613_700 },
    qss: { zeroUpTo: 98_900, fifteenUpTo: 613_700 },
    hoh: { zeroUpTo: 66_200, fifteenUpTo: 579_600 },
  },
};

// NIIT: 3.8% on capital gains for MAGI above thresholds.
export const NIIT_RATE = 0.038;
export const NIIT_THRESHOLDS: Record<FilingStatus, number> = {
  single: 200_000,
  mfs: 125_000,
  mfj: 250_000,
  qss: 250_000,
  hoh: 200_000,
};

// ---------------------------------------------------------------------------
// 22.4 FICA / Payroll
// ---------------------------------------------------------------------------

export const FICA: Record<TaxYear, {
  ssWageBase: number;
  ssRateEmployee: number;
  medicareRate: number;
  addlMedicareRate: number;
  addlMedicareThreshold: Record<FilingStatus, number>;
}> = {
  2025: {
    ssWageBase: 176_100,
    ssRateEmployee: 0.062,
    medicareRate: 0.0145,
    addlMedicareRate: 0.009,
    addlMedicareThreshold: {
      single: 200_000,
      mfs: 125_000,
      mfj: 250_000,
      qss: 250_000,
      hoh: 200_000,
    },
  },
  2026: {
    ssWageBase: 184_500,
    ssRateEmployee: 0.062,
    medicareRate: 0.0145,
    addlMedicareRate: 0.009,
    addlMedicareThreshold: {
      single: 200_000,
      mfs: 125_000,
      mfj: 250_000,
      qss: 250_000,
      hoh: 200_000,
    },
  },
};

// ---------------------------------------------------------------------------
// 22.5 Retirement Contribution Limits
// ---------------------------------------------------------------------------

export const RETIREMENT_LIMITS: Record<TaxYear, {
  k401: number;
  k401CatchUp50: number;
  k401SuperCatch6063: number;
  total415c: number;
  ira: number;
  iraCatchUp50: number;
  sepIraCap: number;
  sepIraPct: number;
  hsaSelf: number;
  hsaFamily: number;
  hsaCatchUp55: number;
  rothCatchupSsThreshold: number | null;
}> = {
  2025: {
    k401: 23_500,
    k401CatchUp50: 7_500,
    k401SuperCatch6063: 11_250,
    total415c: 70_000,
    ira: 7_000,
    iraCatchUp50: 1_000,
    sepIraCap: 70_000,
    sepIraPct: 0.25,
    hsaSelf: 4_300,
    hsaFamily: 8_550,
    hsaCatchUp55: 1_000,
    rothCatchupSsThreshold: null, // not yet effective
  },
  2026: {
    k401: 24_500,
    k401CatchUp50: 8_000,
    k401SuperCatch6063: 11_250,
    total415c: 72_000,
    ira: 7_500,
    iraCatchUp50: 1_100,
    sepIraCap: 72_000,
    sepIraPct: 0.25,
    hsaSelf: 4_400,
    hsaFamily: 8_750,
    hsaCatchUp55: 1_000,
    rothCatchupSsThreshold: 150_000, // SECURE 2.0
  },
};

// ---------------------------------------------------------------------------
// 22.6 RMD Ages and Uniform Lifetime Table (Pub 590-B)
// ---------------------------------------------------------------------------

export function rmdStartAge(birthYear: number): number {
  if (birthYear < 1951) return 73; // already started under prior rules
  if (birthYear <= 1959) return 73;
  return 75; // born 1960 or later
}

// Uniform Lifetime Table from IRS Pub 590-B (effective 2022+).
// Used for owner alive with spouse not >10 years younger / not sole beneficiary.
export const UNIFORM_LIFETIME_TABLE: Record<number, number> = {
  73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0,
  79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8,
  85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2,
  91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4,
  97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4, 101: 6.0, 102: 5.6,
  103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9,
  109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1, 114: 3.0,
  115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3, 120: 2.0,
};

export const RMD_PENALTY_RATE = 0.25; // 10% if corrected within 2 years

// ---------------------------------------------------------------------------
// 22.7 Social Security Constants (2026)
// ---------------------------------------------------------------------------

export const SS = {
  cola2026: 0.028,
  maxBenefitFRA2026: 4_152,
  maxBenefitAge622026: 2_969,
  maxBenefitAge702026: 5_181,
  averageBenefit2026: 2_071,
  earningsTestUnderFRA: { limit: 24_480, withholdRatio: 0.5 },
  earningsTestYearOfFRA: { limit: 65_160, withholdRatio: 1 / 3 },
  // Federal taxation simplified: up to 85% of SS taxable at marginal rate.
  maxFederalTaxableShare: 0.85,
};

// ---------------------------------------------------------------------------
// 22.8 Full Retirement Age Table
// ---------------------------------------------------------------------------

// Returns FRA in months (e.g., 67 years 0 months = 804).
export function fraMonths(birthYear: number): number {
  if (birthYear <= 1937) return 65 * 12;
  if (birthYear <= 1942) return 65 * 12 + (birthYear - 1937) * 2;
  if (birthYear <= 1954) return 66 * 12;
  if (birthYear === 1955) return 66 * 12 + 2;
  if (birthYear === 1956) return 66 * 12 + 4;
  if (birthYear === 1957) return 66 * 12 + 6;
  if (birthYear === 1958) return 66 * 12 + 8;
  if (birthYear === 1959) return 66 * 12 + 10;
  return 67 * 12; // 1960+
}

// ---------------------------------------------------------------------------
// 22.9 IRMAA 2026 (based on 2024 MAGI)
// ---------------------------------------------------------------------------

export type IrmaaTier = {
  singleMagiUpTo: number;
  mfjMagiUpTo: number;
  partBPremium: number; // total monthly premium incl. surcharge
  partDAddl: number; // surcharge on top of prescription plan
};

export const IRMAA_2026: IrmaaTier[] = [
  { singleMagiUpTo: 109_000, mfjMagiUpTo: 218_000, partBPremium: 202.90, partDAddl: 0 },
  { singleMagiUpTo: 137_000, mfjMagiUpTo: 274_000, partBPremium: 284.10, partDAddl: 14.50 },
  { singleMagiUpTo: 171_000, mfjMagiUpTo: 342_000, partBPremium: 405.80, partDAddl: 36.30 },
  { singleMagiUpTo: 205_000, mfjMagiUpTo: 410_000, partBPremium: 527.50, partDAddl: 58.10 },
  { singleMagiUpTo: 500_000, mfjMagiUpTo: 750_000, partBPremium: 649.20, partDAddl: 79.90 },
  { singleMagiUpTo: Infinity, mfjMagiUpTo: Infinity, partBPremium: 689.90, partDAddl: 91.00 },
];

// IRMAA brackets adjust ~2.5%/yr (top tier frozen until 2028).
export const IRMAA_INFLATION = 0.025;
export const IRMAA_TOP_TIER_FROZEN_UNTIL = 2028;

// ---------------------------------------------------------------------------
// 22.10 Estate & Gift Tax (2026)
// ---------------------------------------------------------------------------

export const ESTATE = {
  federalExemption2026: 15_000_000,
  federalRateAboveExemption: 0.40,
  annualGiftExclusion2026: 19_000,
  nonCitizenSpouseGiftExclusion2026: 194_000,
};

// ---------------------------------------------------------------------------
// 22.12 Section 121 Primary Residence Exclusion
// ---------------------------------------------------------------------------

export const SECTION_121_EXCLUSION: Record<FilingStatus, number> = {
  single: 250_000,
  mfs: 250_000,
  hoh: 250_000,
  mfj: 500_000,
  qss: 500_000,
};

// ---------------------------------------------------------------------------
// Healthcare constants
// ---------------------------------------------------------------------------

export const ACA = {
  // 2026 monthly premium defaults per spec (today's dollars), grow at medical inflation.
  bronzePerPerson: 450,
  silverPerPerson: 600,
  goldPerPerson: 800,
  // FPL 2026 (HHS publishes annually; verify when guidance lands).
  fpl1Person2026: 15_650, // TODO(verify-2026): HHS Federal Poverty Guidelines 2026
  fpl2Person2026: 21_150, // TODO(verify-2026): HHS
  subsidyMaxFplPercent: 4.0, // 100-400% FPL
};

export const MEDICARE = {
  partAPremium: 0,
  partBStandardPremium2026: 202.90,
  partDStandalone2026: 46.50,
  medigapPlanGMonthly2026: 170,
  medicalInflation: 0.055,
};

export const LTC = {
  defaultProbability: 0.60,
  defaultAnnualCost2026: 108_000,
  defaultDurationYears: 2.5,
  costInflation: 0.05,
};

// ---------------------------------------------------------------------------
// Investment Tier Table (Sections 5, used by every TierSelect and Monte Carlo)
// ---------------------------------------------------------------------------

export type TierKey =
  | "income-growth"
  | "balanced"
  | "growth-income"
  | "growth"
  | "aggressive-growth"
  | "custom";

export type TierDef = {
  key: TierKey;
  label: string;
  mean: number; // annual return as decimal
  stdev: number; // annual stdev as decimal
};

export const TIERS: TierDef[] = [
  { key: "income-growth", label: "Income/Growth", mean: 0.0596, stdev: 0.06 },
  { key: "balanced", label: "Balanced", mean: 0.0812, stdev: 0.10 },
  { key: "growth-income", label: "Growth/Income", mean: 0.0962, stdev: 0.13 },
  { key: "growth", label: "Growth", mean: 0.1249, stdev: 0.16 },
  { key: "aggressive-growth", label: "Aggressive Growth", mean: 0.1249, stdev: 0.18 },
  { key: "custom", label: "Custom", mean: 0.08, stdev: 0.12 },
];

export function tierFor(key: TierKey): TierDef {
  const t = TIERS.find((x) => x.key === key);
  if (!t) throw new Error(`Unknown tier: ${key}`);
  return t;
}
