import { describe, expect, test } from "vitest";
import {
  benefitAtClaimAge,
  buildClaimHeatmap,
  earningsTestWithholding,
  spousalBenefit,
  survivorBenefit,
} from "./social-security";
import { fraMonths } from "./tax-constants";

describe("benefitAtClaimAge", () => {
  test("at FRA = full PIA", () => {
    const r = benefitAtClaimAge({
      pia: 3_000,
      claimAgeMonths: fraMonths(1965), // FRA 67
      birthYear: 1965,
    });
    expect(r).toBeCloseTo(3_000, 2);
  });

  test("claim at 62 (60 months early) for FRA=67 → 30% reduction", () => {
    // 36 months at 5/9% = 20%, 24 months at 5/12% = 10%. Total = 30%.
    const r = benefitAtClaimAge({
      pia: 3_000,
      claimAgeMonths: 62 * 12,
      birthYear: 1965,
    });
    expect(r).toBeCloseTo(3_000 * 0.70, 1);
  });

  test("claim at 70 (36 months late) for FRA=67 → 24% increase", () => {
    // 36 months * 2/3% = 24%.
    const r = benefitAtClaimAge({
      pia: 3_000,
      claimAgeMonths: 70 * 12,
      birthYear: 1965,
    });
    expect(r).toBeCloseTo(3_000 * 1.24, 1);
  });

  test("claim past 70 capped at 70", () => {
    const r70 = benefitAtClaimAge({ pia: 3_000, claimAgeMonths: 70 * 12, birthYear: 1965 });
    const r72 = benefitAtClaimAge({ pia: 3_000, claimAgeMonths: 72 * 12, birthYear: 1965 });
    expect(r72).toBeCloseTo(r70, 2);
  });
});

describe("spousalBenefit", () => {
  test("at FRA = 50% of higher earner's PIA", () => {
    const r = spousalBenefit({
      higherEarnerPia: 4_000,
      claimAgeMonths: fraMonths(1965),
      birthYear: 1965,
    });
    expect(r).toBeCloseTo(2_000, 2);
  });

  test("no DRCs past FRA on spousal", () => {
    const rFRA = spousalBenefit({
      higherEarnerPia: 4_000,
      claimAgeMonths: fraMonths(1965),
      birthYear: 1965,
    });
    const r70 = spousalBenefit({
      higherEarnerPia: 4_000,
      claimAgeMonths: 70 * 12,
      birthYear: 1965,
    });
    expect(r70).toBeCloseTo(rFRA, 2);
  });

  test("early claim reduces spousal", () => {
    const rEarly = spousalBenefit({
      higherEarnerPia: 4_000,
      claimAgeMonths: 62 * 12,
      birthYear: 1965,
    });
    expect(rEarly).toBeLessThan(2_000);
    expect(rEarly).toBeGreaterThan(1_000);
  });
});

describe("survivorBenefit", () => {
  test("returns max of own vs deceased", () => {
    expect(survivorBenefit({ ownBenefit: 1_500, deceasedBenefit: 2_500 })).toBe(2_500);
    expect(survivorBenefit({ ownBenefit: 3_000, deceasedBenefit: 2_500 })).toBe(3_000);
  });
});

describe("earningsTestWithholding", () => {
  test("at or above FRA: no withholding", () => {
    const r = earningsTestWithholding({
      wages: 100_000,
      ageMonthsAtYearStart: 67 * 12,
      birthYear: 1965,
    });
    expect(r).toBe(0);
  });

  test("under FRA all year: $1 per $2 above limit", () => {
    const r = earningsTestWithholding({
      wages: 50_000, // limit 24,480 → excess 25,520
      ageMonthsAtYearStart: 64 * 12,
      birthYear: 1965,
    });
    expect(r).toBeCloseTo((50_000 - 24_480) * 0.5, 2);
  });

  test("under limit: no withholding", () => {
    const r = earningsTestWithholding({
      wages: 20_000,
      ageMonthsAtYearStart: 64 * 12,
      birthYear: 1965,
    });
    expect(r).toBe(0);
  });
});

describe("buildClaimHeatmap", () => {
  test("single earner: 9x9 with one earner's contribution doubled-equivalent", () => {
    const h = buildClaimHeatmap({
      person1: { pia: 3_000, birthYear: 1965, longevityAge: 95 },
    });
    expect(h.ages.length).toBe(9);
    expect(h.values.length).toBe(9);
    expect(h.values[0].length).toBe(9);
    // For a single earner, all values in a row should be the same (p2 axis is unused).
    expect(h.values[0][0]).toBeCloseTo(h.values[0][8], 2);
  });

  test("heatmap shows that delaying generally pays off for long longevity", () => {
    const h = buildClaimHeatmap({
      person1: { pia: 3_000, birthYear: 1965, longevityAge: 95 },
    });
    // Claim at 70 vs 62 over 95-year life: delaying typically wins.
    const claim62 = h.values[0][0];
    const claim70 = h.values[8][0];
    expect(claim70).toBeGreaterThan(claim62);
  });

  test("couple mode: two earners both contribute", () => {
    const h = buildClaimHeatmap({
      person1: { pia: 3_000, birthYear: 1965, longevityAge: 95 },
      person2: { pia: 2_000, birthYear: 1967, longevityAge: 95 },
    });
    // Different p2 ages should yield different totals at the same p1 age.
    expect(h.values[0][0]).not.toBeCloseTo(h.values[0][8], 0);
  });
});
