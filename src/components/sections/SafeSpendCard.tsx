import { useMemo, useState } from "react";
import { Card, Field, FieldGrid } from "@/components/inputs/Field";
import { NumberInput } from "@/components/inputs/NumberInput";
import { Select } from "@/components/inputs/Select";
import { Slider } from "@/components/inputs/Slider";
import { useStore } from "@/state/store";
import {
  computeSafeSpend,
  computeSavingsGap,
  eligibleContribAssets,
  type SafeSpendResult,
} from "@/lib/safe-spend";
import { formatCompact, formatCurrency, formatPercent } from "@/lib/formatters";
import type { SafeSpendMethod } from "@/state/schema";

const METHOD_OPTIONS: { value: SafeSpendMethod; label: string }[] = [
  { value: "monte-carlo", label: "Monte Carlo (success rate)" },
  { value: "drain-zero", label: "Drain to zero (deterministic)" },
  { value: "4pct", label: "4% rule (initial portfolio)" },
];

export function SafeSpendCard() {
  const plan = useStore((s) => s.plan);
  const updatePlan = useStore((s) => s.updatePlan);
  const config = plan.safeSpend;
  const goal = plan.targetAnnualSpend ?? 0;

  const eligible = useMemo(() => eligibleContribAssets(plan), [plan]);

  // Auto-compute fast methods; gate MC behind a button.
  const [mcResult, setMcResult] = useState<SafeSpendResult | null>(null);
  const [mcRunning, setMcRunning] = useState(false);

  const fastResult = useMemo(() => {
    if (config.method === "monte-carlo") return null;
    return computeSafeSpend(plan);
  }, [plan, config.method]);

  const result = config.method === "monte-carlo" ? mcResult : fastResult;

  const gap = useMemo(() => {
    if (!result || goal <= 0) return null;
    return computeSavingsGap({ plan, safe: result, goalToday: goal });
  }, [plan, result, goal]);

  const runMc = () => {
    setMcRunning(true);
    // Yield to the event loop so the spinner can render before the heavy work.
    setTimeout(() => {
      try {
        setMcResult(computeSafeSpend(plan));
      } finally {
        setMcRunning(false);
      }
    }, 16);
  };

  return (
    <Card
      title="Safe spending & savings gap"
      subtitle="What can you sustainably spend, and how much more do you need to save to hit your goal?"
    >
      <FieldGrid cols={2}>
        <Field label="Method">
          <Select<SafeSpendMethod>
            value={config.method}
            onChange={(v) => {
              updatePlan((p) => {
                p.safeSpend.method = v;
              });
              if (v !== "monte-carlo") setMcResult(null);
            }}
            options={METHOD_OPTIONS}
          />
        </Field>
        <Field
          label="Goal annual base spend (today's $)"
          hint="Excludes healthcare/LTC — those are computed separately."
        >
          <NumberInput
            prefix="$"
            value={goal}
            onChange={(v) =>
              updatePlan((p) => {
                p.targetAnnualSpend = v;
              })
            }
            min={0}
            step={1000}
          />
        </Field>
      </FieldGrid>

      {config.method === "monte-carlo" ? (
        <Field
          label={`Min success rate: ${formatPercent(config.mcThreshold, { whole: true })}`}
          hint="Spend that survives at least this fraction of simulated futures."
        >
          <Slider
            value={Math.round(config.mcThreshold * 100)}
            min={50}
            max={99}
            step={1}
            onChange={(n) =>
              updatePlan((p) => {
                p.safeSpend.mcThreshold = n / 100;
              })
            }
          />
        </Field>
      ) : null}

      {config.method === "monte-carlo" ? (
        <div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium bg-accent text-accent-fg transition-colors hover:opacity-90 disabled:opacity-50"
            onClick={runMc}
            disabled={mcRunning}
          >
            {mcRunning ? "Calculating…" : mcResult ? "Recalculate" : "Calculate safe spend"}
          </button>
          <p className="mt-1.5 text-[11px] text-subtle">
            Runs ~10 Monte Carlo passes (200 sims each). Takes a few seconds.
          </p>
        </div>
      ) : null}

      {result ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Stat
            label="Safe spend (today's $)"
            value={formatCurrency(result.safeSpendToday, { whole: true })}
          />
          <Stat
            label={`Safe spend (nominal at ${plan.profile.taxYear + result.yearsToRetirement})`}
            value={formatCurrency(result.safeSpendNominalAtRetirement, { whole: true })}
          />
          <Stat
            label="Portfolio at retirement"
            value={formatCompact(result.portfolioAtRetirement)}
          />
        </div>
      ) : (
        <p className="text-xs text-muted">
          {config.method === "monte-carlo"
            ? "Click Calculate to run."
            : "Computing…"}
        </p>
      )}

      {result && goal > 0 ? (
        <div className="mt-2 rounded-md border border-border p-3">
          <div className="text-xs font-medium text-muted mb-2">
            Goal vs. safe spend
          </div>
          {goal <= result.safeSpendToday ? (
            <p className="text-sm text-positive">
              On track. Goal ({formatCurrency(goal, { whole: true })}) is within the
              sustainable amount ({formatCurrency(result.safeSpendToday, { whole: true })}).
            </p>
          ) : (
            <>
              <p className="text-sm">
                Shortfall:{" "}
                <span className="num text-negative">
                  {formatCurrency(goal - result.safeSpendToday, { whole: true })}
                </span>{" "}
                / yr (today's $).
              </p>

              <div className="mt-3">
                <Field
                  label="Account to receive extra contributions"
                  hint="Pre-retirement return rate of this account is used to compound the gap-fill."
                >
                  <Select<string>
                    value={config.extraContribAssetId ?? ""}
                    onChange={(v) =>
                      updatePlan((p) => {
                        p.safeSpend.extraContribAssetId = v || undefined;
                      })
                    }
                    options={[
                      { value: "", label: "— pick an account —" },
                      ...eligible.map((a) => ({
                        value: a.id,
                        label: `${a.nickname ?? a.category} (${a.category})`,
                      })),
                    ]}
                  />
                </Field>
              </div>

              {gap && gap.assetId ? (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Stat
                    label="Required extra contribution"
                    value={`${formatCurrency(gap.requiredAnnualContribution, {
                      whole: true,
                    })} / yr`}
                  />
                  <Stat
                    label="Portfolio gap at retirement"
                    value={formatCompact(gap.portfolioGapNominal)}
                  />
                  <Stat
                    label="Compounded at"
                    value={`${formatPercent(gap.assetReturn)} for ${result.yearsToRetirement} yrs`}
                  />
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted">
                  Pick an account above to see the required extra contribution.
                </p>
              )}
            </>
          )}
        </div>
      ) : null}
    </Card>
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
