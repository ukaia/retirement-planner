import { useMemo, useState } from "react";
import { Card } from "@/components/inputs/Field";
import { Select } from "@/components/inputs/Select";
import { SegmentedControl } from "@/components/inputs/SegmentedControl";
import { useStore } from "@/state/store";
import { useDisplayProjection } from "@/state/selectors";
import { accumulationTrajectory } from "@/lib/accumulation-trajectory";
import { computeSafeSpend, computeSavingsGap } from "@/lib/safe-spend";
import { formatCompact, formatCurrency, formatPercent } from "@/lib/formatters";
import type { SafeSpendMethod } from "@/state/schema";

const METHOD_OPTIONS: { value: SafeSpendMethod; label: string }[] = [
  { value: "drain-zero", label: "Drain to zero" },
  { value: "4pct", label: "4% rule" },
  { value: "monte-carlo", label: "Monte Carlo (deterministic gap proxy)" },
];

export function Calculations() {
  const plan = useStore((s) => s.plan);
  const updatePlan = useStore((s) => s.updatePlan);
  const rows = useDisplayProjection();
  const trajectories = useMemo(() => accumulationTrajectory(plan), [plan]);

  // Method dropdown specific to this tab — local override so the user can A/B
  // without changing the global plan setting.
  const [methodOverride, setMethodOverride] = useState<SafeSpendMethod | null>(null);
  const method = methodOverride ?? plan.safeSpend.method;
  const safe = useMemo(
    () =>
      computeSafeSpend({ ...plan, safeSpend: { ...plan.safeSpend, method } }),
    [plan, method],
  );
  const goal = plan.targetAnnualSpend ?? 0;
  const gap = useMemo(() => {
    if (goal <= 0) return null;
    return computeSavingsGap({
      plan: { ...plan, safeSpend: { ...plan.safeSpend, method } },
      safe,
      goalToday: goal,
    });
  }, [plan, safe, goal, method]);

  const [selectedAssetId, setSelectedAssetId] = useState<string>(
    trajectories[0]?.assetId ?? "",
  );
  const selectedTrajectory = trajectories.find((t) => t.assetId === selectedAssetId) ?? trajectories[0];

  const [postView, setPostView] = useState<"income" | "withdrawals" | "tax" | "growth">("income");

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Calculations</h1>
        <p className="mt-1 text-sm text-muted max-w-prose">
          Granular per-account and per-year math behind the projection. Use the
          method selector to compare how each spend-down approach reshapes the
          numbers.
        </p>
      </header>

      <Card title="Method (preview only — does not change saved plan)">
        <Select<SafeSpendMethod>
          value={method}
          onChange={(v) => {
            setMethodOverride(v);
            updatePlan((p) => {
              p.safeSpend.method = v;
            });
          }}
          options={METHOD_OPTIONS}
        />
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat
            label="Safe spend (today's $)"
            value={formatCurrency(safe.safeSpendToday, { whole: true })}
          />
          <Stat
            label="Portfolio at retirement"
            value={formatCompact(safe.portfolioAtRetirement)}
          />
          <Stat
            label="Goal"
            value={goal > 0 ? formatCurrency(goal, { whole: true }) : "—"}
          />
          <Stat
            label="Gap / yr"
            value={
              gap
                ? gap.requiredAnnualContribution > 0
                  ? formatCurrency(gap.requiredAnnualContribution, { whole: true })
                  : "On track"
                : "—"
            }
          />
        </div>
      </Card>

      <Card
        title="Pre-retirement: per-asset year-by-year"
        subtitle="Balance, contribution, and growth each year for the chosen account. Mirrors the engine's monthly-compound formula."
      >
        {trajectories.length === 0 ? (
          <p className="text-sm text-muted">No assets entered.</p>
        ) : (
          <>
            <Select<string>
              value={selectedAssetId}
              onChange={setSelectedAssetId}
              options={trajectories.map((t) => ({
                value: t.assetId,
                label: `${t.label} — ${t.category} — ${formatPercent(t.annualReturn)} return`,
              }))}
            />
            <div className="mt-3 overflow-x-auto -mx-6 px-6">
              <table className="num text-[11px] w-full border-collapse">
                <thead>
                  <tr className="text-subtle text-left">
                    <th className="px-2 py-1.5">Year</th>
                    <th className="px-2 py-1.5">Age</th>
                    <th className="px-2 py-1.5">Balance start</th>
                    <th className="px-2 py-1.5">+ Contribution</th>
                    <th className="px-2 py-1.5">+ Growth</th>
                    <th className="px-2 py-1.5">= Balance end</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTrajectory?.rows.map((r) => (
                    <tr key={r.year} className="border-t border-border">
                      <td className="px-2 py-1">{r.year}</td>
                      <td className="px-2 py-1">{r.age}</td>
                      <td className="px-2 py-1">{formatCompact(r.balanceStart)}</td>
                      <td className="px-2 py-1 text-positive">
                        {r.contribution > 0 ? formatCompact(r.contribution) : "—"}
                      </td>
                      <td className="px-2 py-1 text-positive">{formatCompact(r.growth)}</td>
                      <td className="px-2 py-1 font-semibold">{formatCompact(r.balanceEnd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-subtle">
              Cutoff = retirement of the earlier-retiring spouse (for couples).
              For the later-retiring spouse, additional contributions during the
              overlap years are added directly to the bucket in the post-retirement
              projection.
            </p>
          </>
        )}
      </Card>

      <Card
        title="Post-retirement: detailed breakdown"
        subtitle="Each year of the projection, split into income, withdrawals, taxes, and growth components."
      >
        <div className="mb-3 flex justify-end">
          <SegmentedControl
            value={postView}
            onChange={(v) => setPostView(v as typeof postView)}
            options={[
              { value: "income", label: "Income" },
              { value: "withdrawals", label: "Withdrawals" },
              { value: "tax", label: "Tax" },
              { value: "growth", label: "Growth" },
            ]}
          />
        </div>
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="num text-[11px] w-full border-collapse">
            <thead>
              <tr className="text-subtle text-left">
                <th className="px-2 py-1.5 sticky left-0 bg-surface">Year</th>
                <th className="px-2 py-1.5">Age</th>
                {postView === "income" && (
                  <>
                    <th className="px-2 py-1.5">Wages</th>
                    <th className="px-2 py-1.5">SS p1</th>
                    <th className="px-2 py-1.5">SS p2</th>
                    <th className="px-2 py-1.5">Pensions</th>
                    <th className="px-2 py-1.5">Annuities</th>
                    <th className="px-2 py-1.5">Rental</th>
                    <th className="px-2 py-1.5">Part-time</th>
                    <th className="px-2 py-1.5">RMD</th>
                    <th className="px-2 py-1.5">Roth conv</th>
                  </>
                )}
                {postView === "withdrawals" && (
                  <>
                    <th className="px-2 py-1.5">From taxable</th>
                    <th className="px-2 py-1.5">From trad</th>
                    <th className="px-2 py-1.5">From Roth</th>
                    <th className="px-2 py-1.5">From HSA</th>
                    <th className="px-2 py-1.5">Spend target</th>
                    <th className="px-2 py-1.5">Healthcare</th>
                    <th className="px-2 py-1.5">Shortfall</th>
                  </>
                )}
                {postView === "tax" && (
                  <>
                    <th className="px-2 py-1.5">Federal</th>
                    <th className="px-2 py-1.5">State</th>
                    <th className="px-2 py-1.5">IRMAA</th>
                    <th className="px-2 py-1.5">ACA cost</th>
                    <th className="px-2 py-1.5">Medicare</th>
                    <th className="px-2 py-1.5">Total tax</th>
                    <th className="px-2 py-1.5">Effective rate</th>
                    <th className="px-2 py-1.5">MAGI</th>
                  </>
                )}
                {postView === "growth" && (
                  <>
                    <th className="px-2 py-1.5">Δ Taxable</th>
                    <th className="px-2 py-1.5">Δ Trad</th>
                    <th className="px-2 py-1.5">Δ Roth</th>
                    <th className="px-2 py-1.5">Δ HSA</th>
                    <th className="px-2 py-1.5">Δ Real estate</th>
                    <th className="px-2 py-1.5">Δ Other</th>
                    <th className="px-2 py-1.5">Δ Total</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.year} className="border-t border-border">
                  <td className="px-2 py-1 sticky left-0 bg-surface">{r.year}</td>
                  <td className="px-2 py-1">{r.p1Age}</td>
                  {postView === "income" && (
                    <>
                      <td className="px-2 py-1">{formatCompact(r.wages)}</td>
                      <td className="px-2 py-1">{formatCompact(r.ssP1)}</td>
                      <td className="px-2 py-1">{formatCompact(r.ssP2)}</td>
                      <td className="px-2 py-1">{formatCompact(r.pensions)}</td>
                      <td className="px-2 py-1">{formatCompact(r.annuities)}</td>
                      <td className="px-2 py-1">{formatCompact(r.rentalNet)}</td>
                      <td className="px-2 py-1">{formatCompact(r.partTime)}</td>
                      <td className="px-2 py-1">{formatCompact(r.rmdTotal)}</td>
                      <td className="px-2 py-1">{formatCompact(r.rothConversion)}</td>
                    </>
                  )}
                  {postView === "withdrawals" && (
                    <>
                      <td className="px-2 py-1">{formatCompact(r.withdrawTaxable)}</td>
                      <td className="px-2 py-1">{formatCompact(r.withdrawTraditional)}</td>
                      <td className="px-2 py-1">{formatCompact(r.withdrawRoth)}</td>
                      <td className="px-2 py-1">{formatCompact(r.withdrawHsa)}</td>
                      <td className="px-2 py-1">{formatCompact(r.expensesTotal)}</td>
                      <td className="px-2 py-1">{formatCompact(r.expensesHealthcare)}</td>
                      <td className={`px-2 py-1 ${r.shortfall > 0 ? "text-negative" : ""}`}>
                        {formatCompact(r.shortfall)}
                      </td>
                    </>
                  )}
                  {postView === "tax" && (
                    <>
                      <td className="px-2 py-1">{formatCompact(r.federalTax)}</td>
                      <td className="px-2 py-1">{formatCompact(r.stateTax)}</td>
                      <td className="px-2 py-1">{formatCompact(r.irmaaSurcharge)}</td>
                      <td className="px-2 py-1">{formatCompact(r.acaCost)}</td>
                      <td className="px-2 py-1">{formatCompact(r.medicareCost)}</td>
                      <td className="px-2 py-1 font-semibold">{formatCompact(r.totalTax)}</td>
                      <td className="px-2 py-1">{formatPercent(r.effectiveRate)}</td>
                      <td className="px-2 py-1">{formatCompact(r.magi)}</td>
                    </>
                  )}
                  {postView === "growth" && (
                    <>
                      <td className="px-2 py-1 text-positive">{formatCompact(r.growthTaxable)}</td>
                      <td className="px-2 py-1 text-positive">{formatCompact(r.growthTraditional)}</td>
                      <td className="px-2 py-1 text-positive">{formatCompact(r.growthRoth)}</td>
                      <td className="px-2 py-1 text-positive">{formatCompact(r.growthHsa)}</td>
                      <td className="px-2 py-1 text-positive">{formatCompact(r.growthRealEstate)}</td>
                      <td className="px-2 py-1 text-positive">{formatCompact(r.growthOther)}</td>
                      <td className="px-2 py-1 font-semibold text-positive">{formatCompact(r.growthTotal)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Bucket balances over time" subtitle="What's left in each bucket each year.">
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="num text-[11px] w-full border-collapse">
            <thead>
              <tr className="text-subtle text-left">
                <th className="px-2 py-1.5 sticky left-0 bg-surface">Year</th>
                <th className="px-2 py-1.5">Age</th>
                <th className="px-2 py-1.5">Taxable</th>
                <th className="px-2 py-1.5">Basis</th>
                <th className="px-2 py-1.5">Trad</th>
                <th className="px-2 py-1.5">Roth</th>
                <th className="px-2 py-1.5">HSA</th>
                <th className="px-2 py-1.5">Real estate</th>
                <th className="px-2 py-1.5">Other</th>
                <th className="px-2 py-1.5">Estate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.year} className="border-t border-border">
                  <td className="px-2 py-1 sticky left-0 bg-surface">{r.year}</td>
                  <td className="px-2 py-1">{r.p1Age}</td>
                  <td className="px-2 py-1">{formatCompact(r.taxableBalance)}</td>
                  <td className="px-2 py-1 text-subtle">{formatCompact(r.taxableBasis)}</td>
                  <td className="px-2 py-1">{formatCompact(r.traditionalBalance)}</td>
                  <td className="px-2 py-1">{formatCompact(r.rothBalance)}</td>
                  <td className="px-2 py-1">{formatCompact(r.hsaBalance)}</td>
                  <td className="px-2 py-1">{formatCompact(r.realEstateValue)}</td>
                  <td className="px-2 py-1">{formatCompact(r.otherAssetsValue)}</td>
                  <td className={`px-2 py-1 font-semibold ${r.estateValue <= 0 ? "text-negative" : ""}`}>
                    {formatCompact(r.estateValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-[11px] text-subtle">{label}</div>
      <div className="num text-sm mt-0.5">{value}</div>
    </div>
  );
}
