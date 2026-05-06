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
});
