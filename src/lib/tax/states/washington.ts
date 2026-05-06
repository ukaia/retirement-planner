import type { StateTaxModule } from "./types";

// Washington Capital Gains Tax: 7% on long-term gains above an annual standard
// deduction. 2025: ~$270,000. 2026 figure to be confirmed when the WA DOR
// publishes the inflation adjustment.
const WA_LTCG_DEDUCTION_2025 = 270_000;
// TODO(verify-2026): WA DOR Capital Gains Excise Tax 2026 standard deduction
const WA_LTCG_DEDUCTION_2026 = 277_000;
const WA_LTCG_RATE = 0.07;

// Estate tax: WA has one but it's complex; out of scope for this app's first cut.

export const washington: StateTaxModule = {
  code: "WA",
  name: "Washington",
  taxesSocialSecurity: false,
  computeTax: ({ income, year }) => {
    const deduction = year === 2025 ? WA_LTCG_DEDUCTION_2025 : WA_LTCG_DEDUCTION_2026;
    const taxableGains = Math.max(0, income.longTermGains - deduction);
    const tax = taxableGains * WA_LTCG_RATE;
    const notes: string[] = [];
    if (taxableGains > 0) {
      notes.push(
        `Washington 7% LTCG tax applied above $${deduction.toLocaleString()} annual deduction.`,
      );
    }
    return { total: tax, notes };
  },
  estateTax: () => 0, // TODO: model WA estate tax when adding estate-planning depth
  notes: [
    "No state income tax on wages or retirement income.",
    "7% tax on long-term capital gains above the annual deduction (currently ~$270k).",
    "Washington has a state estate tax — not yet modeled here.",
  ],
};
