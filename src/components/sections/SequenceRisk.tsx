import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/inputs/Field";
import { useStore } from "@/state/store";
import { runSequenceRiskScenarios, type SequenceRiskScenario } from "@/lib/scenarios";
import { formatCompact } from "@/lib/formatters";
import { Term } from "@/components/inputs/Term";

export function SequenceRisk() {
  const plan = useStore((s) => s.plan);
  const bundle = useMemo(() => runSequenceRiskScenarios(plan), [plan]);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Sequence-of-Returns Risk</h1>
        <p className="mt-1 text-sm text-muted max-w-prose">
          <Term k="sequenceRisk">Sequence-of-returns risk</Term> means the order of returns matters
          more than the average. A bad first five years can break a plan that looks healthy on paper.
        </p>
      </header>

      <Card title="Forced bad early returns" subtitle="What happens if the first five retirement years are negative?">
        <ScenarioGrid scenarios={[bundle.baseline, bundle.shockMinus5, bundle.shockMinus10, bundle.shockMinus15]} />
        <ChartCompare scenarios={[bundle.baseline, bundle.shockMinus5, bundle.shockMinus10, bundle.shockMinus15]} />
      </Card>

      <Card title="Same draws, different order" subtitle="Identical returns played forward vs reversed reveal pure sequence risk.">
        <ScenarioGrid scenarios={[bundle.forward, bundle.reversed]} />
        <ChartCompare scenarios={[bundle.forward, bundle.reversed]} />
      </Card>

      <p className="text-[11px] text-subtle max-w-prose">
        Two retirements with identical average returns can end with very different estates. Hedge
        against early bad years with cash buffers, lower starting withdrawal rates, or delayed
        Social Security claims.
      </p>
    </section>
  );
}

function ScenarioGrid({ scenarios }: { scenarios: SequenceRiskScenario[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {scenarios.map((s) => (
        <div key={s.label} className="card !p-4">
          <div className="text-[11px] text-muted">{s.label}</div>
          <div
            className={`num text-base mt-1 ${
              s.finalEstate <= 0 ? "text-negative" : ""
            }`}
          >
            {formatCompact(s.finalEstate)}
          </div>
          {s.worstYearAge !== null ? (
            <div className="text-[11px] text-negative mt-1">
              Depleted at age {s.worstYearAge}
            </div>
          ) : (
            <div className="text-[11px] text-positive mt-1">No depletion</div>
          )}
        </div>
      ))}
    </div>
  );
}

const COLORS = ["#2563eb", "#dc2626", "#a855f7", "#0ea5e9"];

function ChartCompare({ scenarios }: { scenarios: SequenceRiskScenario[] }) {
  if (scenarios.length === 0) return null;
  const reference = scenarios[0].rows;
  const data = reference.map((_, i) => {
    const point: Record<string, number> = { year: reference[i].year };
    for (const s of scenarios) {
      point[s.label] = s.rows[i]?.estateValue ?? 0;
    }
    return point;
  });
  return (
    <div className="h-72 w-full mt-4">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="year" stroke="var(--color-subtle)" fontSize={11} tickLine={false} />
          <YAxis tickFormatter={formatCompact} stroke="var(--color-subtle)" fontSize={11} tickLine={false} width={60} />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v: number) => formatCompact(v)}
          />
          {scenarios.map((s, i) => (
            <Line
              key={s.label}
              type="monotone"
              dataKey={s.label}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
