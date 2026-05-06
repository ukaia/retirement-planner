import { describe, expect, test } from "vitest";
import { computeRmd, lifetimeFactor } from "./rmd";
import { rmdStartAge } from "./tax-constants";

describe("rmdStartAge", () => {
  test("born 1955 → 73", () => {
    expect(rmdStartAge(1955)).toBe(73);
  });
  test("born 1959 → 73", () => {
    expect(rmdStartAge(1959)).toBe(73);
  });
  test("born 1960 → 75", () => {
    expect(rmdStartAge(1960)).toBe(75);
  });
  test("born 1980 → 75", () => {
    expect(rmdStartAge(1980)).toBe(75);
  });
});

describe("lifetimeFactor", () => {
  test("age 73 → 26.5", () => {
    expect(lifetimeFactor(73)).toBe(26.5);
  });
  test("age 95 → 8.9", () => {
    expect(lifetimeFactor(95)).toBe(8.9);
  });
  test("age 70 → no RMD (Infinity)", () => {
    expect(lifetimeFactor(70)).toBe(Infinity);
  });
});

describe("computeRmd", () => {
  test("under start age → 0", () => {
    const r = computeRmd({
      priorYearEndBalance: 1_000_000,
      ownerAgeAtYearEnd: 70,
      ownerBirthYear: 1955,
    });
    expect(r).toBe(0);
  });

  test("$500k at 75 (born 1955, start age 73, factor 24.6)", () => {
    const r = computeRmd({
      priorYearEndBalance: 500_000,
      ownerAgeAtYearEnd: 75,
      ownerBirthYear: 1955,
    });
    expect(r).toBeCloseTo(500_000 / 24.6, 2);
  });

  test("born 1965 (start age 75): 73 → 0; 75 → RMD", () => {
    const r73 = computeRmd({
      priorYearEndBalance: 1_000_000,
      ownerAgeAtYearEnd: 73,
      ownerBirthYear: 1965,
    });
    const r75 = computeRmd({
      priorYearEndBalance: 1_000_000,
      ownerAgeAtYearEnd: 75,
      ownerBirthYear: 1965,
    });
    expect(r73).toBe(0);
    expect(r75).toBeCloseTo(1_000_000 / 24.6, 2);
  });
});
