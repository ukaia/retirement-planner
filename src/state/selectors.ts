import { useMemo } from "react";
import { projectPlan } from "@/lib/projection";
import { toReal } from "@/lib/inflation";
import { computeSafeSpend, computeSavingsGap } from "@/lib/safe-spend";
import { useStore } from "./store";

export function useProjection() {
  const plan = useStore((s) => s.plan);
  return useMemo(() => projectPlan(plan), [plan]);
}

export function useDisplayProjection() {
  const plan = useStore((s) => s.plan);
  const displayMode = useStore((s) => s.displayMode);
  const rows = useProjection();
  return useMemo(() => {
    if (displayMode === "nominal") return rows;
    const baseYear = plan.profile.taxYear;
    const inflation = plan.profile.inflation;
    return rows.map((r) => ({
      ...r,
      wages: toReal(r.wages, r.year, baseYear, inflation),
      ssP1: toReal(r.ssP1, r.year, baseYear, inflation),
      ssP2: toReal(r.ssP2, r.year, baseYear, inflation),
      pensions: toReal(r.pensions, r.year, baseYear, inflation),
      annuities: toReal(r.annuities, r.year, baseYear, inflation),
      rentalNet: toReal(r.rentalNet, r.year, baseYear, inflation),
      partTime: toReal(r.partTime, r.year, baseYear, inflation),
      rmdTotal: toReal(r.rmdTotal, r.year, baseYear, inflation),
      rothConversion: toReal(r.rothConversion, r.year, baseYear, inflation),
      acaCost: toReal(r.acaCost, r.year, baseYear, inflation),
      medicareCost: toReal(r.medicareCost, r.year, baseYear, inflation),
      irmaaSurcharge: toReal(r.irmaaSurcharge, r.year, baseYear, inflation),
      ltcExpected: toReal(r.ltcExpected, r.year, baseYear, inflation),
      expensesBase: toReal(r.expensesBase, r.year, baseYear, inflation),
      expensesHealthcare: toReal(r.expensesHealthcare, r.year, baseYear, inflation),
      expensesTotal: toReal(r.expensesTotal, r.year, baseYear, inflation),
      withdrawTaxable: toReal(r.withdrawTaxable, r.year, baseYear, inflation),
      withdrawTraditional: toReal(r.withdrawTraditional, r.year, baseYear, inflation),
      withdrawRoth: toReal(r.withdrawRoth, r.year, baseYear, inflation),
      withdrawHsa: toReal(r.withdrawHsa, r.year, baseYear, inflation),
      federalTax: toReal(r.federalTax, r.year, baseYear, inflation),
      stateTax: toReal(r.stateTax, r.year, baseYear, inflation),
      totalTax: toReal(r.totalTax, r.year, baseYear, inflation),
      taxableBalance: toReal(r.taxableBalance, r.year, baseYear, inflation),
      taxableBasis: toReal(r.taxableBasis, r.year, baseYear, inflation),
      traditionalBalance: toReal(r.traditionalBalance, r.year, baseYear, inflation),
      rothBalance: toReal(r.rothBalance, r.year, baseYear, inflation),
      hsaBalance: toReal(r.hsaBalance, r.year, baseYear, inflation),
      realEstateValue: toReal(r.realEstateValue, r.year, baseYear, inflation),
      otherAssetsValue: toReal(r.otherAssetsValue, r.year, baseYear, inflation),
      estateValue: toReal(r.estateValue, r.year, baseYear, inflation),
      magi: toReal(r.magi, r.year, baseYear, inflation),
    }));
  }, [rows, plan, displayMode]);
}

export function useAtRetirementSummary() {
  const plan = useStore((s) => s.plan);
  const rows = useProjection();
  return useMemo(() => {
    if (rows.length === 0) {
      return null;
    }
    const first = rows[0];
    const monthlyIncome =
      (first.wages +
        first.ssP1 +
        first.ssP2 +
        first.pensions +
        first.annuities +
        first.rentalNet +
        first.partTime) /
      12;
    const monthlyExpense = first.expensesTotal / 12;
    const totalAssets =
      first.taxableBalance +
      first.traditionalBalance +
      first.rothBalance +
      first.hsaBalance +
      first.realEstateValue +
      first.otherAssetsValue;
    const finalEstate = rows[rows.length - 1].estateValue;
    const yearsWithShortfall = rows.filter((r) => r.shortfall > 0).length;

    // Follow the user's chosen method when it can be evaluated quickly:
    // - drain-zero  → bisection (~75ms), fine for live updates.
    // - 4pct        → analytic, instant.
    // - monte-carlo → too slow per keystroke; fall back to drain-zero and label.
    let extraMonthlySavings: number | null = null;
    let goalToday: number | null = null;
    let safeSpendToday: number | null = null;
    const userMethod = plan.safeSpend.method;
    const liveMethod = userMethod === "monte-carlo" ? "drain-zero" : userMethod;
    const liveMethodLabel = userMethod === "monte-carlo"
      ? "drain-zero proxy (MC needs Calculate)"
      : userMethod === "4pct"
        ? "4% rule"
        : "drain-zero";

    if (plan.targetAnnualSpend && plan.targetAnnualSpend > 0) {
      goalToday = plan.targetAnnualSpend;
      const livePlan = { ...plan, safeSpend: { ...plan.safeSpend, method: liveMethod } };
      const safe = computeSafeSpend(livePlan);
      const gap = computeSavingsGap({ plan: livePlan, safe, goalToday });
      extraMonthlySavings = gap.requiredAnnualContribution / 12;
      safeSpendToday = safe.safeSpendToday;
    } else {
      const livePlan = { ...plan, safeSpend: { ...plan.safeSpend, method: liveMethod } };
      safeSpendToday = computeSafeSpend(livePlan).safeSpendToday;
    }

    return {
      yearOfRetirement: first.year,
      ageAtRetirement: first.p1Age,
      totalAssets,
      monthlyIncome,
      monthlyExpense,
      gap: monthlyIncome - monthlyExpense,
      finalEstate,
      yearsWithShortfall,
      goalToday,
      extraMonthlySavings,
      safeSpendToday,
      liveMethodLabel,
    };
  }, [rows, plan]);
}
