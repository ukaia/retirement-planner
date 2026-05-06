import type { StateTaxModule } from "./types";

export const alaska: StateTaxModule = {
  code: "AK",
  name: "Alaska",
  taxesSocialSecurity: false,
  computeTax: () => ({ total: 0 }),
  estateTax: () => 0,
  notes: [
    "No state income tax.",
    "No state capital gains tax.",
    "No state estate tax.",
  ],
};
