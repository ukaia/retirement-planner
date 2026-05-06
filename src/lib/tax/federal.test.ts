import { describe, expect, test } from "vitest";
import {
  bracketTax,
  federalIncomeTax,
  ficaTax,
  niitTax,
  ssTaxablePortion,
} from "./federal";
import { FED_BRACKETS } from "../tax-constants";

describe("bracketTax", () => {
  test("zero income → zero tax", () => {
    expect(bracketTax(0, FED_BRACKETS[2026].single)).toBe(0);
  });

  test("entirely within first bracket", () => {
    // $10,000 at 10% = $1,000.
    expect(bracketTax(10_000, FED_BRACKETS[2026].single)).toBeCloseTo(1_000, 2);
  });

  test("spans first two brackets", () => {
    // 2026 single: 10% to $12,400, 12% to $50,400.
    // $30,000 = 12,400*0.10 + (30,000-12,400)*0.12 = 1,240 + 2,112 = $3,352.
    expect(bracketTax(30_000, FED_BRACKETS[2026].single)).toBeCloseTo(3_352, 2);
  });
});

describe("federalIncomeTax (2026 MFJ)", () => {
  test("standard deduction wipes low income", () => {
    // 2026 MFJ std ded = $32,200. Income = $30,000 → no tax.
    const r = federalIncomeTax({
      ordinaryIncome: 30_000,
      filingStatus: "mfj",
      year: 2026,
    });
    expect(r.total).toBe(0);
  });

  test("$150k MFJ ordinary income, hand-checked", () => {
    // Taxable = 150,000 - 32,200 = 117,800.
    // 24,800*0.10=2,480; (100,800-24,800)*0.12=9,120; (117,800-100,800)*0.22=3,740.
    // Total = 15,340.
    const r = federalIncomeTax({
      ordinaryIncome: 150_000,
      filingStatus: "mfj",
      year: 2026,
    });
    expect(r.ordinaryTax).toBeCloseTo(15_340, 0);
    expect(r.ltcgTax).toBe(0);
    expect(r.total).toBeCloseTo(15_340, 0);
  });

  test("LTCG stacking: low ordinary + gains in 0% LTCG bracket", () => {
    // 2026 MFJ: LTCG 0% up to $98,900 of taxable total.
    // Ord = 50,000, gains = 20,000. Total gross = 70,000.
    // After std ded ($32,200): taxable total = 37,800. Taxable ord = 17,800. Taxable gains = 20,000.
    // All gains within 0% bracket since 17,800 + 20,000 = 37,800 < 98,900.
    const r = federalIncomeTax({
      ordinaryIncome: 50_000,
      longTermGains: 20_000,
      filingStatus: "mfj",
      year: 2026,
    });
    expect(r.ltcgTax).toBe(0);
    // Ord tax: 17,800. Brackets: first 24,800 at 10% caps at 17,800*0.10=1,780.
    expect(r.ordinaryTax).toBeCloseTo(1_780, 0);
  });

  test("LTCG stacking: gains spanning 0%, 15%, 20% bands", () => {
    // 2026 MFJ: 0% up to $98,900, 15% up to $613,700, 20% above.
    // Ord = 100,000 ordinary income, gains = 600,000.
    // After std ded $32,200: taxable ord = 67,800; taxable gains = 600,000.
    // Stack:
    //  0% room: 98,900 - 67,800 = 31,100 of gains @ 0%
    //  15% room: 613,700 - (67,800+31,100) = 514,800 of gains @ 15% (cap at remaining 568,900)
    //  20% room: 600,000 - 31,100 - 514,800 = 54,100 @ 20%
    // 514,800 * 0.15 = 77,220 ; 54,100 * 0.20 = 10,820 ; total LTCG = 88,040
    const r = federalIncomeTax({
      ordinaryIncome: 100_000,
      longTermGains: 600_000,
      filingStatus: "mfj",
      year: 2026,
    });
    expect(r.ltcgTax).toBeCloseTo(88_040, 0);
  });
});

describe("niitTax", () => {
  test("below MAGI threshold = 0", () => {
    expect(
      niitTax({ investmentIncome: 50_000, magi: 200_000, filingStatus: "mfj" }),
    ).toBe(0);
  });

  test("above MAGI threshold = 3.8% on lesser of investment income or excess", () => {
    // Single threshold 200k. MAGI 250k → excess 50k. Investment income 30k → 30k * 3.8% = 1,140.
    expect(
      niitTax({ investmentIncome: 30_000, magi: 250_000, filingStatus: "single" }),
    ).toBeCloseTo(1_140, 2);
  });

  test("excess less than investment income", () => {
    // MAGI 220k single, threshold 200k → excess 20k. Investment income 50k → 20k * 3.8% = 760.
    expect(
      niitTax({ investmentIncome: 50_000, magi: 220_000, filingStatus: "single" }),
    ).toBeCloseTo(760, 2);
  });
});

describe("ficaTax", () => {
  test("wages below SS wage base, 2026 single", () => {
    const r = ficaTax({ wages: 100_000, filingStatus: "single", year: 2026 });
    expect(r.socialSecurity).toBeCloseTo(100_000 * 0.062, 2);
    expect(r.medicare).toBeCloseTo(100_000 * 0.0145, 2);
    expect(r.addlMedicare).toBe(0);
  });

  test("wages above SS wage base capped, 2026", () => {
    const r = ficaTax({ wages: 250_000, filingStatus: "single", year: 2026 });
    // SS capped at 184,500.
    expect(r.socialSecurity).toBeCloseTo(184_500 * 0.062, 2);
    // Medicare uncapped.
    expect(r.medicare).toBeCloseTo(250_000 * 0.0145, 2);
    // Additional Medicare: (250k - 200k) * 0.9% = 450.
    expect(r.addlMedicare).toBeCloseTo(450, 2);
  });
});

describe("ssTaxablePortion", () => {
  test("low total income: SS not taxed", () => {
    const t = ssTaxablePortion({
      ssBenefits: 24_000,
      otherOrdinaryIncome: 5_000,
      filingStatus: "single",
    });
    expect(t).toBe(0);
  });

  test("high income: 85% cap kicks in", () => {
    const t = ssTaxablePortion({
      ssBenefits: 24_000,
      otherOrdinaryIncome: 200_000,
      filingStatus: "single",
    });
    expect(t).toBeCloseTo(24_000 * 0.85, 2);
  });

  test("middle range: stair-step partial", () => {
    // Single: lower 25k, upper 34k.
    // SS=20k, other=20k. Provisional = 20k + 10k = 30k.
    // Above lower 5k. Tier1: min(5k, 9k) * 0.5 = 2,500. Tier2: 0. Cap: 17k.
    const t = ssTaxablePortion({
      ssBenefits: 20_000,
      otherOrdinaryIncome: 20_000,
      filingStatus: "single",
    });
    expect(t).toBeCloseTo(2_500, 2);
  });
});
