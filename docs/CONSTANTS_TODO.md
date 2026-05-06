# Constants to verify against 2026 sources

Each entry below is a value used in the calc engine that's currently a 2026 estimate or carried forward from a prior year. When the authoritative source publishes 2026 numbers, update the corresponding constant in `src/lib/tax-constants.ts` (or the relevant state module) and remove the `// TODO(verify-2026)` comment.

## Federal & related

- **2026 SS max benefits at 62 / FRA / 70** — confirm against the SSA fact sheet for January 2026.
- **2026 annual gift exclusion** — confirm $19,000 in IRS Rev. Proc. 2025-32.
- **2026 IRMAA brackets** — already sourced from CMS fact sheet; reconfirm if they revise mid-year.

## Washington

- `WA_LTCG_DEDUCTION_2026` (`src/lib/tax/states/washington.ts`) — currently estimated at $277,000. Source: WA DOR Capital Gains Excise Tax annual deduction.

## Oregon

- `OR_STD_DED_2026` (`src/lib/tax/states/oregon.ts`) — currently $2,420 single / $4,840 MFJ. Source: Oregon DOR Pub 150-206-436 (2026 edition).
- `OR_FED_SUBTRACT_*_2026` — phaseout bands are approximate ($5k linear window above the threshold). Source: Oregon DOR.

## Idaho

- `ID_ZERO_RATE_2026` (`src/lib/tax/states/idaho.ts`) — currently $4,950 single / $9,900 MFJ (estimated forward from 2025).
- Idaho post-OBBB conformity status (HB 559, Feb 2026) — confirm signed and effective.

## ACA / FPL

- `fpl1Person2026` and `fpl2Person2026` (`src/lib/tax-constants.ts`) — currently $15,650 / $21,150. Source: HHS Federal Poverty Guidelines (typically published January).
- ACA premium tax credit phaseout is a linear approximation; the production form follows the Applicable Figure table from the IRS. Refine if more accurate subsidy modeling is needed.

## Healthcare premium defaults

- ACA Bronze / Silver / Gold defaults ($450 / $600 / $800 per person, 2026 USD) are spec defaults. Users can override per plan; consider linking to healthcare.gov for current quotes when wiring up the help text.
- Medigap Plan G default ($170/mo, 2026 USD) is a national average.
