import { Card } from "@/components/inputs/Field";
import { useDisplayProjection } from "@/state/selectors";
import { useStore } from "@/state/store";
import { formatCompact, formatCurrency, formatPercent } from "@/lib/formatters";
import { AssetGrowthChart } from "@/components/charts/AssetGrowthChart";
import { IncomeVsExpenseChart } from "@/components/charts/IncomeVsExpenseChart";
import { TaxStackedAreaChart } from "@/components/charts/TaxStackedAreaChart";
import { SegmentedControl } from "@/components/inputs/SegmentedControl";
import { Warnings } from "@/components/layout/Warnings";

export function Results() {
  const rows = useDisplayProjection();
  const displayMode = useStore((s) => s.displayMode);
  const setDisplayMode = useStore((s) => s.setDisplayMode);

  if (rows.length === 0) {
    return (
      <section className="space-y-4">
        <header>
          <h1 className="text-xl font-semibold tracking-tight">Results</h1>
          <p className="mt-1 text-sm text-muted">Add inputs to populate.</p>
        </header>
      </section>
    );
  }

  const first = rows[0];
  const last = rows[rows.length - 1];
  const totalLifetimeTax = rows.reduce((s, r) => s + r.totalTax, 0);

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Results</h1>
          <p className="mt-1 text-sm text-muted max-w-prose">
            Year-by-year projection from retirement to plan-to age.
          </p>
        </div>
        <SegmentedControl
          value={displayMode}
          onChange={setDisplayMode}
          options={[
            { value: "nominal", label: "Nominal" },
            { value: "real", label: "Today's $" },
          ]}
        />
      </header>

      <Warnings />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Assets at retirement" value={formatCompact(
          first.taxableBalance + first.traditionalBalance + first.rothBalance + first.hsaBalance + first.realEstateValue + first.otherAssetsValue,
        )} />
        <Stat label="Final estate" value={formatCompact(last.estateValue)} tone={last.estateValue <= 0 ? "negative" : undefined} />
        <Stat label="Lifetime tax" value={formatCompact(totalLifetimeTax)} />
        <Stat label="Years modeled" value={String(rows.length)} />
      </div>

      <Card title="Asset growth & drawdown">
        <AssetGrowthChart rows={rows} />
      </Card>

      <Card title="Income vs expenses">
        <IncomeVsExpenseChart rows={rows} />
      </Card>

      <Card title="Tax breakdown over time">
        <TaxStackedAreaChart rows={rows} />
      </Card>

      <Card title="Year-by-year detail">
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="num text-[11px] w-full border-collapse">
            <thead>
              <tr className="text-subtle text-left">
                <th className="px-2 py-1.5 sticky left-0 bg-surface">Year</th>
                <th className="px-2 py-1.5">Age</th>
                <th className="px-2 py-1.5">Wages</th>
                <th className="px-2 py-1.5">SS</th>
                <th className="px-2 py-1.5">RMD</th>
                <th className="px-2 py-1.5">Spending</th>
                <th className="px-2 py-1.5">Healthcare</th>
                <th className="px-2 py-1.5">Tax</th>
                <th className="px-2 py-1.5">Trad</th>
                <th className="px-2 py-1.5">Roth</th>
                <th className="px-2 py-1.5">Taxable</th>
                <th className="px-2 py-1.5">Estate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.year} className={`border-t border-border ${r.shortfall > 0 ? "bg-negative/5" : ""}`}>
                  <td className="px-2 py-1 sticky left-0 bg-surface">{r.year}</td>
                  <td className="px-2 py-1">{r.p1Age}</td>
                  <td className="px-2 py-1">{formatCompact(r.wages)}</td>
                  <td className="px-2 py-1">{formatCompact(r.ssP1 + r.ssP2)}</td>
                  <td className="px-2 py-1">{formatCompact(r.rmdTotal)}</td>
                  <td className="px-2 py-1">{formatCompact(r.expensesBase)}</td>
                  <td className="px-2 py-1">{formatCompact(r.expensesHealthcare)}</td>
                  <td className="px-2 py-1">{formatCompact(r.totalTax)}</td>
                  <td className="px-2 py-1">{formatCompact(r.traditionalBalance)}</td>
                  <td className="px-2 py-1">{formatCompact(r.rothBalance)}</td>
                  <td className="px-2 py-1">{formatCompact(r.taxableBalance)}</td>
                  <td className={`px-2 py-1 ${r.estateValue <= 0 ? "text-negative" : ""}`}>
                    {formatCompact(r.estateValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] text-subtle">
          Effective tax rate first year: <span className="num">{formatPercent(first.effectiveRate)}</span>.
          Last year: <span className="num">{formatPercent(last.effectiveRate)}</span>.
          {rows.some((r) => r.shortfall > 0) ? (
            <span className="text-negative ml-2">
              {formatCurrency(rows.reduce((s, r) => s + r.shortfall, 0), { whole: true })} cumulative shortfall.
            </span>
          ) : null}
        </div>
      </Card>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "negative" }) {
  return (
    <div className="card !p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`num text-base mt-1 ${tone === "negative" ? "text-negative" : ""}`}>{value}</div>
    </div>
  );
}
