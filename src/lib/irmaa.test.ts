import { describe, expect, test } from "vitest";
import {
  annualIrmaaCost,
  findIrmaaTier,
  irmaaTiersForYear,
  isNearIrmaaCliff,
} from "./irmaa";

describe("findIrmaaTier", () => {
  test("low MAGI single → tier 1 (standard)", () => {
    const t = findIrmaaTier({ magi: 50_000, year: 2026, filingStatus: "single" });
    expect(t.partBPremium).toBeCloseTo(202.90, 2);
    expect(t.partDAddl).toBe(0);
  });

  test("high MAGI single ($600k) → top tier", () => {
    const t = findIrmaaTier({ magi: 600_000, year: 2026, filingStatus: "single" });
    expect(t.partBPremium).toBeCloseTo(689.90, 2);
    expect(t.partDAddl).toBeCloseTo(91.00, 2);
  });

  test("MFJ uses joint thresholds", () => {
    const tSingle = findIrmaaTier({ magi: 250_000, year: 2026, filingStatus: "single" });
    const tMfj = findIrmaaTier({ magi: 250_000, year: 2026, filingStatus: "mfj" });
    expect(tMfj.partBPremium).toBeLessThan(tSingle.partBPremium);
  });
});

describe("irmaaTiersForYear", () => {
  test("2026 returns base", () => {
    const tiers = irmaaTiersForYear(2026);
    expect(tiers[0].singleMagiUpTo).toBe(109_000);
  });

  test("2030 brackets are inflated", () => {
    const tiers = irmaaTiersForYear(2030);
    expect(tiers[0].singleMagiUpTo).toBeGreaterThan(109_000);
    // 2.5%/yr * 4 years ≈ 1.1038
    expect(tiers[0].singleMagiUpTo).toBeCloseTo(109_000 * Math.pow(1.025, 4), 0);
  });

  test("top tier frozen until 2028", () => {
    const t2027 = irmaaTiersForYear(2027);
    const top = t2027[t2027.length - 1];
    expect(top.singleMagiUpTo).toBe(Infinity);
    expect(top.mfjMagiUpTo).toBe(Infinity);
  });
});

describe("annualIrmaaCost", () => {
  test("standard tier annual = 12 * 202.90", () => {
    const r = annualIrmaaCost({
      magiTwoYearsPrior: 80_000,
      year: 2026,
      filingStatus: "single",
    });
    expect(r.annual).toBeCloseTo(12 * 202.90, 2);
  });
});

describe("isNearIrmaaCliff", () => {
  test("within $5k of next threshold = near", () => {
    const r = isNearIrmaaCliff({
      magi: 107_000, // $2k below 109k tier 1 cap
      year: 2026,
      filingStatus: "single",
    });
    expect(r.near).toBe(true);
    expect(r.gap).toBeCloseTo(2_000, 2);
  });

  test("comfortably within tier = not near", () => {
    const r = isNearIrmaaCliff({
      magi: 50_000,
      year: 2026,
      filingStatus: "single",
    });
    expect(r.near).toBe(false);
  });
});
