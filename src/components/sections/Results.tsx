import { useState } from "react";
import { Card } from "@/components/inputs/Field";
import { useDisplayProjection } from "@/state/selectors";
import { useStore } from "@/state/store";
import { formatCompact, formatCurrency, formatPercent } from "@/lib/formatters";
import type { ProjectionRow } from "@/lib/projection";
import { effectiveReturns } from "@/lib/projection";
import { AssetGrowthChart } from "@/components/charts/AssetGrowthChart";
import { IncomeVsExpenseChart } from "@/components/charts/IncomeVsExpenseChart";
import { TaxStackedAreaChart } from "@/components/charts/TaxStackedAreaChart";
import { SegmentedControl } from "@/components/inputs/SegmentedControl";
import { Select } from "@/components/inputs/Select";
import { Field } from "@/components/inputs/Field";
import { Warnings } from "@/components/layout/Warnings";
import { SafeSpendCard } from "./SafeSpendCard";
import type { TierKey } from "@/lib/tax-constants";

export function Results() {
  const rows = useDisplayProjection();
  const plan = useStore((s) => s.plan);
  const displayMode = useStore((s) => s.displayMode);
  const setDisplayMode = useStore((s) => s.setDisplayMode);
  const returns = effectiveReturns(plan);

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

      <SafeSpendCard />

      <Card title="Expected portfolio returns">
        <p className="text-xs text-muted mb-2">
          Weighted-average return assumption used each year, by bucket. Comes from each
          asset's tier; change tiers in Assets — or use the bulk control below to set
          retirement-tier on every account at once.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ReturnPill label="Taxable" rate={returns.taxable} />
          <ReturnPill label="Traditional" rate={returns.traditional} />
          <ReturnPill label="Roth" rate={returns.roth} />
          <ReturnPill label="HSA" rate={returns.hsa} />
        </div>
        <BulkRetirementTier />
      </Card>

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
        <DetailTable rows={rows} />
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

/** Bulk-set every investable asset's `retirementTier`. Lets the user dial in
 *  a glide-path on the Results page without visiting each asset row. */
function BulkRetirementTier() {
  const plan = useStore((s) => s.plan);
  const updatePlan = useStore((s) => s.updatePlan);

  // Detect if all investable assets currently agree on a retirementTier value;
  // if so, show that as the active selection. Otherwise show "mixed".
  const investable = plan.assets.filter((a) =>
    a.category === "trad-401k" ||
    a.category === "roth-401k" ||
    a.category === "trad-ira" ||
    a.category === "roth-ira" ||
    a.category === "sep-ira" ||
    a.category === "hsa" ||
    a.category === "brokerage",
  );
  const tiers = new Set(
    investable.map((a) =>
      a.category === "real-estate" || a.category === "other"
        ? "__same__"
        : a.retirementTier?.tier ?? "__same__",
    ),
  );
  const currentValue = tiers.size === 1 ? Array.from(tiers)[0] : "__mixed__";

  if (investable.length === 0) return null;

  const apply = (tier: string) => {
    updatePlan((p) => {
      for (const a of p.assets) {
        if (
          a.category !== "real-estate" &&
          a.category !== "other"
        ) {
          if (tier === "__same__") {
            a.retirementTier = undefined;
          } else {
            a.retirementTier = { tier: tier as TierKey };
          }
        }
      }
    });
  };

  return (
    <div className="mt-4 pt-3 border-t border-border">
      <Field
        label="Retirement-tier (applies to all investable accounts)"
        hint={
          currentValue === "__mixed__"
            ? "Accounts currently use different retirement tiers."
            : "Click a tier to override every account's retirement-phase return."
        }
      >
        <Select<string>
          value={currentValue === "__mixed__" ? "" : currentValue}
          onChange={apply}
          options={[
            { value: "__same__", label: "Same as working years" },
            { value: "income-growth", label: "Income/Growth (5.96%)" },
            { value: "balanced", label: "Balanced (8.12%)" },
            { value: "growth-income", label: "Growth/Income (9.62%)" },
            { value: "growth", label: "Growth (12.49%)" },
            { value: "aggressive-growth", label: "Aggressive Growth (12.49%)" },
            ...(currentValue === "__mixed__"
              ? [{ value: "", label: "— mixed (pick to override) —" }]
              : []),
          ]}
        />
      </Field>
    </div>
  );
}

function ReturnPill({ label, rate }: { label: string; rate: number | null }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-[11px] text-subtle">{label}</div>
      <div className={`num text-sm mt-0.5 ${rate === null ? "text-subtle" : ""}`}>
        {rate === null ? "—" : formatPercent(rate)}
      </div>
    </div>
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

type DetailView = "summary" | "balances" | "flows";

function DetailTable({ rows }: { rows: ProjectionRow[] }) {
  const [view, setView] = useState<DetailView>("summary");
  return (
    <>
      <div className="mb-2 flex justify-end">
        <SegmentedControl
          value={view}
          onChange={(v) => setView(v as DetailView)}
          options={[
            { value: "summary", label: "Summary" },
            { value: "balances", label: "All balances" },
            { value: "flows", label: "Withdrawals & growth" },
          ]}
        />
      </div>
      <div className="overflow-x-auto -mx-6 px-6">
        <table className="num text-[11px] w-full border-collapse">
          <thead>
            <tr className="text-subtle text-left">
              <th className="px-2 py-1.5 sticky left-0 bg-surface">Year</th>
              <th className="px-2 py-1.5">Age</th>
              {view === "summary" && (
                <>
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
                </>
              )}
              {view === "balances" && (
                <>
                  <th className="px-2 py-1.5">Taxable</th>
                  <th className="px-2 py-1.5">Trad</th>
                  <th className="px-2 py-1.5">Roth</th>
                  <th className="px-2 py-1.5">HSA</th>
                  <th className="px-2 py-1.5">Real estate</th>
                  <th className="px-2 py-1.5">Other</th>
                  <th className="px-2 py-1.5">Estate</th>
                </>
              )}
              {view === "flows" && (
                <>
                  <th className="px-2 py-1.5">WD-Tax</th>
                  <th className="px-2 py-1.5">WD-Trad</th>
                  <th className="px-2 py-1.5">WD-Roth</th>
                  <th className="px-2 py-1.5">WD-HSA</th>
                  <th className="px-2 py-1.5">Roth conv</th>
                  <th className="px-2 py-1.5">Growth $</th>
                  <th className="px-2 py-1.5">Tax</th>
                  <th className="px-2 py-1.5">Estate</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.year}
                className={`border-t border-border ${r.shortfall > 0 ? "bg-negative/5" : ""}`}
              >
                <td className="px-2 py-1 sticky left-0 bg-surface">{r.year}</td>
                <td className="px-2 py-1">{r.p1Age}</td>
                {view === "summary" && (
                  <>
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
                  </>
                )}
                {view === "balances" && (
                  <>
                    <td className="px-2 py-1">{formatCompact(r.taxableBalance)}</td>
                    <td className="px-2 py-1">{formatCompact(r.traditionalBalance)}</td>
                    <td className="px-2 py-1">{formatCompact(r.rothBalance)}</td>
                    <td className="px-2 py-1">{formatCompact(r.hsaBalance)}</td>
                    <td className="px-2 py-1">{formatCompact(r.realEstateValue)}</td>
                    <td className="px-2 py-1">{formatCompact(r.otherAssetsValue)}</td>
                    <td className={`px-2 py-1 ${r.estateValue <= 0 ? "text-negative" : ""}`}>
                      {formatCompact(r.estateValue)}
                    </td>
                  </>
                )}
                {view === "flows" && (
                  <>
                    <td className="px-2 py-1">{formatCompact(r.withdrawTaxable)}</td>
                    <td className="px-2 py-1">{formatCompact(r.withdrawTraditional)}</td>
                    <td className="px-2 py-1">{formatCompact(r.withdrawRoth)}</td>
                    <td className="px-2 py-1">{formatCompact(r.withdrawHsa)}</td>
                    <td className="px-2 py-1">{formatCompact(r.rothConversion)}</td>
                    <td className="px-2 py-1 text-positive">{formatCompact(r.growthTotal)}</td>
                    <td className="px-2 py-1">{formatCompact(r.totalTax)}</td>
                    <td className={`px-2 py-1 ${r.estateValue <= 0 ? "text-negative" : ""}`}>
                      {formatCompact(r.estateValue)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
