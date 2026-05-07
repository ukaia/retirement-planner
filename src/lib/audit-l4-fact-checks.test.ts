/**
 * Audit Layer 4: Hand-computed fact-checks.
 *
 * Pin specific calculations to authoritative sources (IRS Pub 590-B,
 * SSA reduction tables, 2026 brackets per Rev. Proc. 2025-32).
 * Ensures the engine isn't drifting away from real-world rules.
 */

import { describe, expect, test } from "vitest";
import { computeRmd, lifetimeFactor } from "./rmd";
import { benefitAtClaimAge } from "./social-security";
import { federalIncomeTax } from "./tax/federal";
import { findIrmaaTier } from "./irmaa";

describe("Layer 4: RMD (IRS Pub 590-B Uniform Lifetime Table)", () => {
  test("age 73: divisor 26.5", () => {
    expect(lifetimeFactor(73)).toBe(26.5);
  });
  test("age 75: divisor 24.6", () => {
    expect(lifetimeFactor(75)).toBe(24.6);
  });
  test("age 80: divisor 20.2", () => {
    expect(lifetimeFactor(80)).toBe(20.2);
  });
  test("age 85: divisor 16.0", () => {
    expect(lifetimeFactor(85)).toBe(16.0);
  });
  test("RMD at 73 with $1M: $37,735.85", () => {
    const r = computeRmd({
      priorYearEndBalance: 1_000_000,
      ownerAgeAtYearEnd: 73,
      ownerBirthYear: 1953,
    });
    expect(r).toBeCloseTo(1_000_000 / 26.5, 2);
  });
  test("RMD before age 73 is zero", () => {
    expect(
      computeRmd({ priorYearEndBalance: 500_000, ownerAgeAtYearEnd: 72, ownerBirthYear: 1954 }),
    ).toBe(0);
  });
});

describe("Layer 4: Social Security claim-age math", () => {
  // Birth year 1960+: FRA = 67 = 804 months.
  test("claiming at FRA returns 100% of PIA", () => {
    const m = benefitAtClaimAge({ pia: 3000, claimAgeMonths: 67 * 12, birthYear: 1960 });
    expect(m).toBeCloseTo(3000, 0);
  });

  test("claiming at 62 (60 months early) reduces to 70%", () => {
    // First 36 months: 5/9 of 1% per month = 20%. Next 24 months: 5/12 of 1% = 10%. Total 30% reduction.
    const m = benefitAtClaimAge({ pia: 3000, claimAgeMonths: 62 * 12, birthYear: 1960 });
    expect(m).toBeCloseTo(3000 * 0.7, 0);
  });

  test("claiming at 70 (36 months past FRA) gives 124% of PIA", () => {
    // 8% per year DRC × 3 years = 24% bonus.
    const m = benefitAtClaimAge({ pia: 3000, claimAgeMonths: 70 * 12, birthYear: 1960 });
    expect(m).toBeCloseTo(3000 * 1.24, 0);
  });

  test("claiming at 65 (24 months early) reduces to 86.67%", () => {
    // 24 months × 5/9 of 1% = 13.33% reduction → 86.67%.
    const m = benefitAtClaimAge({ pia: 3000, claimAgeMonths: 65 * 12, birthYear: 1960 });
    expect(m).toBeCloseTo(3000 * (1 - 24 * 5 / 9 / 100), 0);
  });
});

describe("Layer 4: 2026 federal income tax (Rev. Proc. 2025-32)", () => {
  test("MFJ standard-deduction wipe: $30k income → $0 tax", () => {
    const r = federalIncomeTax({
      ordinaryIncome: 30_000,
      longTermGains: 0,
      qualifiedDividends: 0,
      filingStatus: "mfj",
      year: 2026,
    });
    expect(r.total).toBe(0);
  });

  test("Single $80k ordinary: ~$6,772 (after $16,100 std ded)", () => {
    // After standard deduction $16,100: taxable = $63,900.
    // 10% on first 12,400 = 1,240
    // 12% on (50,400 - 12,400) = 12% × 38,000 = 4,560
    // 22% on (63,900 - 50,400) = 22% × 13,500 = 2,970
    // Total = 8,770
    const r = federalIncomeTax({
      ordinaryIncome: 80_000,
      longTermGains: 0,
      qualifiedDividends: 0,
      filingStatus: "single",
      year: 2026,
    });
    expect(r.total).toBeCloseTo(8_770, -2); // within $50
  });

  test("MFJ LTCG-only $50k: 0% bracket fully covers it", () => {
    // 0% LTCG bracket for MFJ 2026 reaches well above $50k.
    const r = federalIncomeTax({
      ordinaryIncome: 0,
      longTermGains: 50_000,
      qualifiedDividends: 0,
      filingStatus: "mfj",
      year: 2026,
    });
    expect(r.total).toBe(0);
  });
});

describe("Layer 4: IRMAA tiers (2026)", () => {
  test("MFJ MAGI $200k → tier 0 (no surcharge)", () => {
    const r = findIrmaaTier({
      magi: 200_000,
      filingStatus: "mfj",
      year: 2026,
    });
    // 2026 Part B base premium per CMS = $202.90/mo.
    expect(r.partBPremium).toBeCloseTo(202.9, 0);
    expect(r.partDAddl).toBe(0);
  });

  test("MFJ MAGI $260k → tier 1 surcharge applies", () => {
    const r = findIrmaaTier({
      magi: 260_000,
      filingStatus: "mfj",
      year: 2026,
    });
    expect(r.partBPremium).toBeGreaterThan(200);
    expect(r.partDAddl).toBeGreaterThan(0);
  });

  test("MFJ MAGI $1M → top tier", () => {
    const r = findIrmaaTier({
      magi: 1_000_000,
      filingStatus: "mfj",
      year: 2026,
    });
    expect(r.partBPremium).toBeGreaterThan(500); // top tier ~$594/mo combined Part B
  });
});

describe("Layer 4: Section 121 exclusion mechanics", () => {
  // Single: $250k. MFJ: $500k. Engine should subtract these from gain on primary home.
  // Tested indirectly through the projection (covered in Layer 1's appreciation test
  // and Layer 5's trajectory checks). Here we just confirm the constants in the
  // engine match the IRS values.
  test("Section 121 constants match IRS", async () => {
    const { SECTION_121_EXCLUSION } = await import("./tax-constants");
    expect(SECTION_121_EXCLUSION.single).toBe(250_000);
    expect(SECTION_121_EXCLUSION.mfj).toBe(500_000);
    expect(SECTION_121_EXCLUSION.qss).toBe(500_000);
    expect(SECTION_121_EXCLUSION.mfs).toBe(250_000);
  });
});

describe("Layer 4: Standard deductions match Rev. Proc. 2025-32", () => {
  test("2026 standard deductions", async () => {
    const { STANDARD_DEDUCTION } = await import("./tax-constants");
    expect(STANDARD_DEDUCTION[2026].single).toBe(16_100);
    expect(STANDARD_DEDUCTION[2026].mfj).toBe(32_200);
    expect(STANDARD_DEDUCTION[2026].hoh).toBe(24_150);
  });
});
