import { useMemo } from "react";
import { Card } from "@/components/inputs/Field";
import { useStore } from "@/state/store";
import { buildVariantResults } from "@/lib/comparison";
import { formatCompact, formatCurrency } from "@/lib/formatters";

export function Comparison() {
  const plan = useStore((s) => s.plan);
  const results = useMemo(() => buildVariantResults(plan), [plan]);

  const baseline = results[0];

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Comparison</h1>
        <p className="mt-1 text-sm text-muted max-w-prose">
          Built-in alternatives next to your current plan. Each row uses your inputs as a
          starting point and applies one strategic shift. The "Money lasts to" column shows
          the age at which liquid accounts run dry — blank means they don't.
        </p>
      </header>

      <Card>
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="num text-[12px] w-full border-collapse">
            <thead>
              <tr className="text-subtle text-left">
                <th className="px-2 py-2 sticky left-0 bg-surface min-w-[180px]">Strategy</th>
                <th className="px-2 py-2 text-right">At retirement</th>
                <th className="px-2 py-2 text-right">Monthly income</th>
                <th className="px-2 py-2 text-right">Monthly expense</th>
                <th className="px-2 py-2 text-right">Lifetime tax</th>
                <th className="px-2 py-2 text-right">Final estate</th>
                <th className="px-2 py-2 text-right">Money lasts to</th>
                <th className="px-2 py-2 text-right">Shortfall years</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const isBaseline = r.id === "current";
                const finalDelta = r.finalEstate - baseline.finalEstate;
                return (
                  <tr key={r.id} className={`border-t border-border ${isBaseline ? "bg-surface-2" : ""}`}>
                    <td className="px-2 py-2 sticky left-0 bg-surface align-top">
                      <div className="font-medium text-fg">{r.label}</div>
                      <div className="text-[11px] text-subtle font-normal">{r.description}</div>
                    </td>
                    <td className="px-2 py-2 text-right">{formatCompact(r.totalAtRetirement)}</td>
                    <td className="px-2 py-2 text-right">
                      {formatCurrency(r.monthlyIncomeAtRetirement, { whole: true })}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {formatCurrency(r.monthlyExpenseAtRetirement, { whole: true })}
                    </td>
                    <td className="px-2 py-2 text-right">{formatCompact(r.lifetimeTax)}</td>
                    <td className={`px-2 py-2 text-right ${r.finalEstate <= 0 ? "text-negative" : ""}`}>
                      <div>{formatCompact(r.finalEstate)}</div>
                      {!isBaseline ? (
                        <div className={`text-[10px] ${finalDelta >= 0 ? "text-positive" : "text-negative"}`}>
                          {finalDelta >= 0 ? "+" : ""}
                          {formatCompact(finalDelta)}
                        </div>
                      ) : null}
                    </td>
                    <td className={`px-2 py-2 text-right ${r.depletionAge !== null ? "text-negative" : "text-positive"}`}>
                      {r.depletionAge !== null ? `Age ${r.depletionAge}` : "Lasts"}
                    </td>
                    <td className={`px-2 py-2 text-right ${r.shortfallYears > 0 ? "text-negative" : ""}`}>
                      {r.shortfallYears}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-[11px] text-subtle max-w-prose">
        These are deterministic projections (no Monte Carlo) using each scenario's mean returns.
        For probability-weighted comparisons, run Monte Carlo on each variant separately.
      </p>
    </section>
  );
}
