import { Card, Field } from "@/components/inputs/Field";
import { Slider } from "@/components/inputs/Slider";
import { useStore } from "@/state/store";
import { useMonteCarlo } from "@/workers/useMonteCarlo";
import { MonteCarloFan } from "@/components/charts/MonteCarloFan";
import { formatCompact, formatPercent } from "@/lib/formatters";

export function MonteCarlo() {
  const plan = useStore((s) => s.plan);
  const updatePlan = useStore((s) => s.updatePlan);
  const sims = plan.options.monteCarlo.simulations;
  const { result, running } = useMonteCarlo(plan, sims, 600);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Monte Carlo</h1>
        <p className="mt-1 text-sm text-muted max-w-prose">
          Each year's returns are drawn independently per asset from a normal distribution
          with the tier's mean and volatility. Runs in a background worker so the UI stays responsive.
        </p>
      </header>

      <Card>
        <Field label={`Simulations: ${sims}`}>
          <Slider
            ariaLabel="Simulations"
            min={250}
            max={5000}
            step={250}
            value={sims}
            onChange={(v) => updatePlan((p) => { p.options.monteCarlo.simulations = v; })}
          />
        </Field>
        <div className="text-[11px] text-subtle">
          Default 500. Higher = tighter confidence, slower. 1,000 is a good balance.
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          label="Success rate"
          value={result ? formatPercent(result.successRate, { whole: true }) : "—"}
          tone={result && result.successRate < 0.85 ? "negative" : result && result.successRate >= 0.95 ? "positive" : undefined}
        />
        <Stat
          label="Median final estate"
          value={result ? formatCompact(result.percentiles.bands.p50[result.percentiles.bands.p50.length - 1]) : "—"}
        />
        <Stat
          label="Worst-10% median estate"
          value={result ? formatCompact(result.worst10pct.medianFinalEstate) : "—"}
        />
        <Stat
          label="Worst-10% median depletion age"
          value={result?.worst10pct.medianDepletionAge ? String(result.worst10pct.medianDepletionAge) : "—"}
        />
      </div>

      <Card title="Estate value — percentile fan" subtitle="10–90 outer band, 25–75 inner band, line = median">
        {running ? (
          <div className="h-72 flex items-center justify-center text-sm text-muted">Running…</div>
        ) : result ? (
          <MonteCarloFan result={result} />
        ) : (
          <div className="h-72 flex items-center justify-center text-sm text-muted">No result yet.</div>
        )}
      </Card>

      <Card title="Final estate distribution" subtitle="Sorted ascending across simulations">
        {result ? (
          <Histogram values={result.finalEstateDistribution} />
        ) : (
          <div className="text-sm text-muted">—</div>
        )}
      </Card>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  const color = tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "";
  return (
    <div className="card !p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`num text-base mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function Histogram({ values }: { values: number[] }) {
  if (values.length === 0) return <div className="text-sm text-muted">—</div>;
  const buckets = 30;
  const min = values[0];
  const max = values[values.length - 1];
  if (min === max) return <div className="text-sm text-muted">All simulations ended at {formatCompact(min)}.</div>;
  const step = (max - min) / buckets;
  const counts = new Array(buckets).fill(0);
  for (const v of values) {
    const idx = Math.min(buckets - 1, Math.floor((v - min) / step));
    counts[idx]++;
  }
  const peak = Math.max(...counts);
  return (
    <div className="flex items-end h-32 gap-px">
      {counts.map((c, i) => (
        <div
          key={i}
          className="flex-1 bg-accent/40 rounded-sm"
          style={{ height: `${(c / peak) * 100}%` }}
          title={`${formatCompact(min + i * step)}–${formatCompact(min + (i + 1) * step)}: ${c}`}
        />
      ))}
    </div>
  );
}
