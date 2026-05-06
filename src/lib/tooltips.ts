export type GlossaryEntry = {
  term: string;
  definition: string;
  source?: string;
};

export const GLOSSARY: Record<string, GlossaryEntry> = {
  ltcg: {
    term: "Long-Term Capital Gains",
    definition:
      "Profit from selling an asset held over a year. Taxed at 0%, 15%, or 20% federally depending on total taxable income.",
    source: "IRC §1(h)",
  },
  fica: {
    term: "FICA",
    definition:
      "Federal payroll taxes: 6.2% Social Security up to the wage base, plus 1.45% Medicare uncapped, plus 0.9% Additional Medicare above thresholds.",
  },
  cola: {
    term: "COLA",
    definition: "Cost-of-living adjustment. Annual inflation-based increase in benefits like Social Security or pensions.",
  },
  rmd: {
    term: "Required Minimum Distribution",
    definition:
      "The minimum amount you must withdraw each year from tax-deferred retirement accounts after a certain age (73 or 75 depending on birth year).",
    source: "IRC §401(a)(9)",
  },
  fra: {
    term: "Full Retirement Age",
    definition: "The age at which you're entitled to 100% of your Social Security benefit. 67 for those born 1960 or later.",
  },
  pia: {
    term: "Primary Insurance Amount",
    definition:
      "Your Social Security benefit at full retirement age, computed from your highest 35 years of indexed earnings.",
  },
  drc: {
    term: "Delayed Retirement Credits",
    definition:
      "An 8%-per-year boost to your Social Security benefit for each year you delay claiming past FRA, up to age 70.",
  },
  irmaa: {
    term: "IRMAA",
    definition:
      "Income-Related Monthly Adjustment Amount. A surcharge added to Medicare Parts B and D for higher-income retirees, based on MAGI from two years prior.",
  },
  magi: {
    term: "Modified Adjusted Gross Income",
    definition:
      "AGI plus certain add-backs. Used for IRMAA, IRA deduction phaseouts, and ACA premium tax credits.",
  },
  section121: {
    term: "Section 121 Exclusion",
    definition:
      "Excludes up to $250,000 (single) or $500,000 (MFJ) of capital gain on the sale of a primary residence, if owned and used as a primary home for 2 of the last 5 years.",
    source: "IRC §121",
  },
  depreciationRecapture: {
    term: "Depreciation Recapture",
    definition:
      "When a rental property is sold, the depreciation taken in prior years is taxed as ordinary income (capped federally at 25%) before any LTCG calculation.",
    source: "IRC §1250",
  },
  niit: {
    term: "Net Investment Income Tax",
    definition: "An additional 3.8% tax on net investment income for high earners (MAGI above $200k single / $250k MFJ).",
  },
  rothConversion: {
    term: "Roth Conversion",
    definition:
      "Moving money from a traditional (pre-tax) account to a Roth (after-tax) account. The converted amount is taxable as ordinary income in the year of conversion, but grows tax-free thereafter.",
  },
  assetLocation: {
    term: "Asset Location",
    definition:
      "The strategy of placing investments in the most tax-efficient account type — e.g., high-growth equities in Roth, bonds in Traditional, tax-efficient index funds in Taxable.",
  },
  sequenceRisk: {
    term: "Sequence-of-Returns Risk",
    definition:
      "The risk that poor market returns early in retirement disproportionately damage a plan's longevity, even if average returns over the full retirement are healthy.",
  },
  stepUpBasis: {
    term: "Step-Up in Basis",
    definition:
      "When inherited, an asset's cost basis resets to its fair market value at the date of death — eliminating capital gains tax on appreciation that occurred during the original owner's lifetime.",
  },
  stretchIra: {
    term: "Stretch IRA",
    definition:
      "An inherited IRA paid out over the beneficiary's lifetime. SECURE Act of 2019 limits most non-spouse beneficiaries to a 10-year payout.",
  },
};
