import { describe, expect, test } from "vitest";
import { withdrawForSpend, type IncomeForYear, type WithdrawalBuckets } from "./withdrawal";

const emptyIncome = (overrides: Partial<IncomeForYear> = {}): IncomeForYear => ({
  wages: 0,
  ordinaryIncome: 0,
  rmdIncome: 0,
  socialSecurity: 0,
  rothConversion: 0,
  forcedLongTermGains: 0,
  qualifiedDividends: 0,
  idahoPropertyGains: 0,
  qualifiedMedicalSpend: 0,
  ...overrides,
});

const emptyBuckets = (overrides: Partial<WithdrawalBuckets> = {}): WithdrawalBuckets => ({
  taxable: { balance: 0, basis: 0 },
  traditional: 0,
  roth: 0,
  hsa: 0,
  ...overrides,
});

describe("withdrawForSpend", () => {
  test("if target met by SS + traditional, no shortfall", () => {
    const r = withdrawForSpend({
      targetNetSpend: 60_000,
      income: emptyIncome({ socialSecurity: 36_000 }),
      buckets: emptyBuckets({ traditional: 1_000_000 }),
      filingStatus: "single",
      state: "AK",
      year: 2026,
    });
    expect(r.shortfall).toBe(0);
    expect(r.grossWithdrawn.traditional).toBeGreaterThan(0);
  });

  test("Roth used last, tax-free", () => {
    const r = withdrawForSpend({
      targetNetSpend: 50_000,
      income: emptyIncome(),
      buckets: emptyBuckets({ roth: 200_000 }),
      filingStatus: "single",
      state: "AK",
      year: 2026,
    });
    expect(r.taxes.total).toBe(0);
    expect(r.grossWithdrawn.roth).toBeGreaterThanOrEqual(50_000 - 1);
  });

  test("HSA covers qualified medical first", () => {
    const r = withdrawForSpend({
      targetNetSpend: 30_000,
      income: emptyIncome({ qualifiedMedicalSpend: 10_000 }),
      buckets: emptyBuckets({ hsa: 50_000, roth: 100_000 }),
      filingStatus: "single",
      state: "AK",
      year: 2026,
    });
    expect(r.grossWithdrawn.hsa).toBe(10_000);
    expect(r.buckets.hsa).toBe(40_000);
  });

  test("Taxable brokerage realizes LTCG on gain portion only", () => {
    const r = withdrawForSpend({
      targetNetSpend: 50_000,
      income: emptyIncome(),
      buckets: emptyBuckets({
        taxable: { balance: 200_000, basis: 50_000 },
      }),
      filingStatus: "single",
      state: "AK",
      year: 2026,
    });
    // Drawing about $50k → 75% gain portion = ~$37,500 gain.
    expect(r.grossWithdrawn.taxable).toBeGreaterThan(0);
    expect(r.grossWithdrawn.taxableGains).toBeGreaterThan(0);
    expect(r.grossWithdrawn.taxableGains).toBeLessThanOrEqual(r.grossWithdrawn.taxable * 0.76);
  });

  test("shortfall reported when buckets empty", () => {
    const r = withdrawForSpend({
      targetNetSpend: 100_000,
      income: emptyIncome(),
      buckets: emptyBuckets({ roth: 10_000 }),
      filingStatus: "single",
      state: "AK",
      year: 2026,
    });
    expect(r.shortfall).toBeGreaterThan(80_000);
  });

  test("priority order: taxable before traditional", () => {
    const r = withdrawForSpend({
      targetNetSpend: 30_000,
      income: emptyIncome(),
      buckets: emptyBuckets({
        taxable: { balance: 100_000, basis: 100_000 }, // no gains, free withdrawals
        traditional: 100_000,
      }),
      filingStatus: "single",
      state: "AK",
      year: 2026,
    });
    expect(r.grossWithdrawn.taxable).toBeGreaterThan(0);
    expect(r.grossWithdrawn.traditional).toBe(0);
  });

  test("gross-up overshoot: zero-gain taxable bucket is not over-withdrawn", () => {
    // approxRate for taxable is 0.18, but actual marginal here is 0% (basis ==
    // balance, no gain → no LTCG, AK has no state tax). The first iter would
    // estimate grossNeed = 50000/0.82 ≈ 60976; without the refund correction
    // that whole amount stays drawn even though only 50000 is needed.
    const r = withdrawForSpend({
      targetNetSpend: 50_000,
      income: emptyIncome(),
      buckets: emptyBuckets({
        taxable: { balance: 200_000, basis: 200_000 },
      }),
      filingStatus: "single",
      state: "AK",
      year: 2026,
    });
    expect(r.shortfall).toBeLessThan(1);
    // Should draw ~$50k, not the unrefunded $60.9k.
    expect(r.grossWithdrawn.taxable).toBeLessThan(50_500);
    expect(r.grossWithdrawn.taxable).toBeGreaterThan(49_500);
    // Bucket reflects the corrected withdrawal.
    expect(r.buckets.taxable.balance).toBeGreaterThan(149_500);
    expect(r.buckets.taxable.balance).toBeLessThan(150_500);
    expect(r.taxes.total).toBe(0);
  });

  test("gross-up overshoot: traditional with low-bracket income gets refunded", () => {
    // approxRate for traditional is 0.27, but with $20k target and AK (no
    // state tax) the actual marginal is around 10-12% federal only.
    const r = withdrawForSpend({
      targetNetSpend: 20_000,
      income: emptyIncome(),
      buckets: emptyBuckets({ traditional: 500_000 }),
      filingStatus: "single",
      state: "AK",
      year: 2026,
    });
    expect(r.shortfall).toBeLessThan(1);
    // Net coverage should land at the target, not above it. With approxRate
    // 0.27 but actual marginal ~0% (small enough to fall within the standard
    // deduction), grossNeed estimate of 20000/0.73 ≈ 27397 would over-draw
    // by ~7400 without correction. Refund should bring it down toward 20000.
    expect(r.grossWithdrawn.traditional).toBeLessThan(22_000);
    expect(r.grossWithdrawn.traditional).toBeGreaterThan(19_500);
  });

  test("forced-income surplus: redeposited to taxable, not lost", () => {
    // Wages 100k cover 60k spend with surplus after tax. Without the surplus
    // deposit, the unspent net cash vanishes and books don't balance.
    const beforeBalance = 250_000;
    const r = withdrawForSpend({
      targetNetSpend: 60_000,
      income: emptyIncome({ wages: 100_000 }),
      buckets: emptyBuckets({
        taxable: { balance: beforeBalance, basis: 200_000 },
      }),
      filingStatus: "single",
      state: "AK",
      year: 2026,
    });
    expect(r.shortfall).toBe(0);
    // No need to draw — wages already cover spend + tax.
    expect(r.grossWithdrawn.taxable).toBe(0);
    expect(r.grossWithdrawn.traditional).toBe(0);
    expect(r.grossWithdrawn.roth).toBe(0);
    // Net cash surplus (wages − tax − spend) should land in taxable bucket
    // as already-taxed capital (basis bumped equally).
    const afterTaxIncome = 100_000 - r.taxes.total;
    const expectedSurplus = afterTaxIncome - 60_000;
    expect(r.buckets.taxable.balance).toBeGreaterThan(beforeBalance + expectedSurplus - 1);
    expect(r.buckets.taxable.balance).toBeLessThan(beforeBalance + expectedSurplus + 1);
    // Basis tracks balance for the deposit (no gain on already-taxed cash).
    expect(r.buckets.taxable.basis - 200_000).toBeCloseTo(expectedSurplus, 0);
  });

  test("forced-income surplus from RMD overflow: redeposited", () => {
    // RMDs at advanced age can exceed needs. The forced-cash overflow should
    // land in taxable, not vanish.
    const r = withdrawForSpend({
      targetNetSpend: 40_000,
      income: emptyIncome({ rmdIncome: 80_000 }),
      buckets: emptyBuckets({
        taxable: { balance: 100_000, basis: 100_000 },
      }),
      filingStatus: "single",
      state: "AK",
      year: 2026,
    });
    expect(r.shortfall).toBe(0);
    expect(r.grossWithdrawn.taxable).toBe(0);
    // RMD-after-tax minus 40k spend should be deposited.
    const surplus = 80_000 - r.taxes.total - 40_000;
    expect(r.buckets.taxable.balance).toBeGreaterThan(100_000 + surplus - 1);
    expect(r.buckets.taxable.balance).toBeLessThan(100_000 + surplus + 1);
  });
});
