import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProjectionRow } from "@/lib/projection";
import { formatCompact } from "@/lib/formatters";

export function AssetGrowthChart({ rows }: { rows: ProjectionRow[] }) {
  const data = rows.map((r) => ({
    year: r.year,
    Taxable: r.taxableBalance,
    Traditional: r.traditionalBalance,
    Roth: r.rothBalance,
    HSA: r.hsaBalance,
    "Real estate": r.realEstateValue,
    Other: r.otherAssetsValue,
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
            formatter={(v: number) => formatCompact(v)}
          />
          {[
            ["Taxable", "#94a3b8"],
            ["Traditional", "#64748b"],
            ["Roth", "#2563eb"],
            ["HSA", "#0ea5e9"],
            ["Real estate", "#a78bfa"],
            ["Other", "#cbd5e1"],
          ].map(([key, color]) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stackId="1"
              stroke={color as string}
              fill={color as string}
              fillOpacity={0.4}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
