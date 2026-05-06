import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonteCarloResult } from "@/lib/monte-carlo";
import { formatCompact } from "@/lib/formatters";

export function MonteCarloFan({ result }: { result: MonteCarloResult }) {
  const { years, bands } = result.percentiles;
  const data = years.map((year, i) => ({
    year,
    "10–90 band": [bands.p10[i], bands.p90[i]],
    "25–75 band": [bands.p25[i], bands.p75[i]],
    Median: bands.p50[i],
  }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
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
            formatter={(v: unknown) => {
              if (Array.isArray(v)) return v.map((x) => formatCompact(x as number)).join(" – ");
              return formatCompact(v as number);
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area dataKey="10–90 band" stroke="none" fill="#2563eb" fillOpacity={0.12} />
          <Area dataKey="25–75 band" stroke="none" fill="#2563eb" fillOpacity={0.22} />
          <Line type="monotone" dataKey="Median" stroke="#2563eb" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
