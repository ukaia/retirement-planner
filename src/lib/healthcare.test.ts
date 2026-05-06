import { describe, expect, test } from "vitest";
import { annualAcaCost, annualMedicareBase, expectedLtcAnnualCost } from "./healthcare";

describe("annualAcaCost", () => {
  test("low MAGI single → near full subsidy", () => {
    const r = annualAcaCost({
      tier: "silver",
      people: 1,
      year: 2026,
      magi: 18_000, // ~115% FPL
    });
    expect(r.subsidy).toBeGreaterThan(0);
    expect(r.net).toBeLessThan(r.gross);
  });

  test("high MAGI → no subsidy", () => {
    const r = annualAcaCost({
      tier: "silver",
      people: 1,
      year: 2026,
      magi: 100_000,
    });
    expect(r.subsidy).toBe(0);
    expect(r.net).toBeCloseTo(r.gross, 2);
  });

  test("inflates over time", () => {
    const r2026 = annualAcaCost({ tier: "silver", people: 1, year: 2026, magi: 100_000 });
    const r2030 = annualAcaCost({ tier: "silver", people: 1, year: 2030, magi: 100_000 });
    expect(r2030.gross).toBeGreaterThan(r2026.gross);
  });
});

describe("annualMedicareBase", () => {
  test("2026 base sums Part B + Part D (no Medigap)", () => {
    const r = annualMedicareBase({ year: 2026, includeMedigap: false });
    // 12 * (202.90 + 46.50) = 12 * 249.40 = 2,992.80
    expect(r).toBeCloseTo(12 * (202.90 + 46.50), 2);
  });

  test("Medigap adds Plan G", () => {
    const noMedigap = annualMedicareBase({ year: 2026, includeMedigap: false });
    const withMedigap = annualMedicareBase({ year: 2026, includeMedigap: true });
    expect(withMedigap - noMedigap).toBeCloseTo(12 * 170, 1);
  });

  test("inflates", () => {
    const r2026 = annualMedicareBase({ year: 2026, includeMedigap: false });
    const r2036 = annualMedicareBase({ year: 2036, includeMedigap: false });
    expect(r2036).toBeGreaterThan(r2026 * 1.5);
  });
});

describe("expectedLtcAnnualCost", () => {
  test("0.6 prob * 108k * 2.5y / 30y retirement = ~5,400/y", () => {
    const r = expectedLtcAnnualCost({
      year: 2026,
      spreadOverYears: 30,
    });
    expect(r).toBeCloseTo((0.6 * 108_000 * 2.5) / 30, 0);
  });
});
