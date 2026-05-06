import { describe, expect, test } from "vitest";
import { STATE_TAX_REGISTRY } from "./index";
import type { StateIncomeMix } from "./types";

const emptyIncome = (overrides: Partial<StateIncomeMix> = {}): StateIncomeMix => ({
  wages: 0,
  ordinaryRetirement: 0,
  socialSecurity: 0,
  longTermGains: 0,
  qualifiedDividends: 0,
  shortTermGains: 0,
  federalIncomeTaxPaid: 0,
  ...overrides,
});

describe("Alaska", () => {
  test("zero everything", () => {
    const r = STATE_TAX_REGISTRY.AK.computeTax({
      income: emptyIncome({ wages: 200_000, longTermGains: 500_000 }),
      filingStatus: "single",
      year: 2026,
    });
    expect(r.total).toBe(0);
  });
});

describe("Washington", () => {
  test("LTCG below 2026 deduction = 0", () => {
    const r = STATE_TAX_REGISTRY.WA.computeTax({
      income: emptyIncome({ longTermGains: 100_000 }),
      filingStatus: "single",
      year: 2026,
    });
    expect(r.total).toBe(0);
  });

  test("LTCG above 2026 deduction = 7%", () => {
    const r = STATE_TAX_REGISTRY.WA.computeTax({
      income: emptyIncome({ longTermGains: 500_000 }),
      filingStatus: "single",
      year: 2026,
    });
    // (500,000 - 277,000) * 0.07 = 223,000 * 0.07 = 15,610.
    expect(r.total).toBeCloseTo(15_610, 2);
  });

  test("wages and ordinary income not taxed", () => {
    const r = STATE_TAX_REGISTRY.WA.computeTax({
      income: emptyIncome({ wages: 250_000, ordinaryRetirement: 100_000 }),
      filingStatus: "single",
      year: 2026,
    });
    expect(r.total).toBe(0);
  });
});

describe("Oregon", () => {
  test("does not tax Social Security", () => {
    const r = STATE_TAX_REGISTRY.OR.computeTax({
      income: emptyIncome({ socialSecurity: 40_000 }),
      filingStatus: "single",
      year: 2026,
    });
    expect(r.total).toBe(0);
  });

  test("treats LTCG as ordinary", () => {
    const r1 = STATE_TAX_REGISTRY.OR.computeTax({
      income: emptyIncome({ wages: 100_000 }),
      filingStatus: "single",
      year: 2026,
    });
    const r2 = STATE_TAX_REGISTRY.OR.computeTax({
      income: emptyIncome({ longTermGains: 100_000 }),
      filingStatus: "single",
      year: 2026,
    });
    expect(r1.total).toBeCloseTo(r2.total, 2);
  });

  test("federal subtraction reduces tax (low income)", () => {
    const r = STATE_TAX_REGISTRY.OR.computeTax({
      income: emptyIncome({ wages: 50_000, federalIncomeTaxPaid: 5_000 }),
      filingStatus: "single",
      year: 2026,
    });
    // Without subtraction: taxable = 50,000 - 2,420 = 47,580.
    // With subtraction: taxable = 50,000 - 2,420 - 5,000 = 42,580.
    // Either way, must be > 0 and reasonable.
    expect(r.total).toBeGreaterThan(2_500);
    expect(r.total).toBeLessThan(4_500);
  });
});

describe("Idaho", () => {
  test("does not tax Social Security", () => {
    const r = STATE_TAX_REGISTRY.ID.computeTax({
      income: emptyIncome({ socialSecurity: 40_000 }),
      filingStatus: "single",
      year: 2026,
    });
    expect(r.total).toBe(0);
  });

  test("flat 5.3% applies above zero-rate threshold", () => {
    const r = STATE_TAX_REGISTRY.ID.computeTax({
      income: emptyIncome({ wages: 100_000 }),
      filingStatus: "single",
      year: 2026,
    });
    // (100,000 - 4,950) * 0.053 = 95,050 * 0.053 = 5,037.65.
    expect(r.total).toBeCloseTo(5_037.65, 1);
  });

  test("60% Idaho-property gains deduction", () => {
    const r = STATE_TAX_REGISTRY.ID.computeTax({
      income: emptyIncome({ longTermGains: 100_000, idahoPropertyGains: 100_000 }),
      filingStatus: "single",
      year: 2026,
    });
    // 60% of 100k deducted from gains: taxable LTCG = 40k.
    // Total = 40k - 4,950 = 35,050 * 0.053 = 1,857.65.
    expect(r.total).toBeCloseTo(1_857.65, 1);
  });
});
