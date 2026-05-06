import type { FilingStatus } from "../../tax-constants";
import type { StateTaxModule } from "./types";

// Idaho 2025: flat 5.3% above zero-rate threshold.
// TODO(verify-2026): Idaho State Tax Commission HB 40 / 2026 thresholds
const ID_FLAT_RATE = 0.053;

// 2025 zero-rate thresholds per spec; 2026 verified separately.
const ID_ZERO_RATE_2025: Record<FilingStatus, number> = {
  single: 4_811,
  mfs: 4_811,
  hoh: 9_622,
  mfj: 9_622,
  qss: 9_622,
};
const ID_ZERO_RATE_2026: Record<FilingStatus, number> = {
  single: 4_950,
  mfs: 4_950,
  hoh: 9_900,
  mfj: 9_900,
  qss: 9_900,
};

export const idaho: StateTaxModule = {
  code: "ID",
  name: "Idaho",
  taxesSocialSecurity: false, // Idaho does not tax SS.
  computeTax: ({ income, filingStatus, year }) => {
    // Idaho conforms to federal standard deduction post-OBBB (HB 559 Feb 2026).
    // Idaho taxable income includes wages, ordinary retirement, capital gains.
    // Apply 60% deduction on qualifying Idaho-property gains.
    const idahoGainsDeduction = (income.idahoPropertyGains ?? 0) * 0.60;

    const grossID =
      income.wages +
      income.ordinaryRetirement +
      Math.max(0, income.longTermGains - idahoGainsDeduction) +
      income.qualifiedDividends +
      income.shortTermGains;

    const zeroRate =
      year === 2026 ? ID_ZERO_RATE_2026[filingStatus] : ID_ZERO_RATE_2025[filingStatus];

    const taxable = Math.max(0, grossID - zeroRate);
    const tax = taxable * ID_FLAT_RATE;

    const notes: string[] = ["Idaho does not tax Social Security."];
    if (idahoGainsDeduction > 0) {
      notes.push(
        `60% Idaho property capital gains deduction applied: $${Math.round(idahoGainsDeduction).toLocaleString()}.`,
      );
    }
    return { total: tax, notes };
  },
  estateTax: () => 0,
  notes: [
    "Flat 5.3% on income above the zero-rate threshold.",
    "Does not tax Social Security.",
    "60% deduction available on qualifying Idaho-property capital gains.",
    "No state estate tax.",
  ],
};
