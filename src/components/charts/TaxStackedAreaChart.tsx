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

export function TaxStackedAreaChart({ rows }: { rows: ProjectionRow[] }) {
  const data = rows.map((r) => ({
    year: r.year,
    Federal: r.federalTax,
    State: r.stateTax,
    IRMAA: r.irmaaSurcharge,
  }));
  return (
    <div className="h-64 w-full">
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
          <Area type="monotone" dataKey="Federal" stackId="t" stroke="#2563eb" fill="#2563eb" fillOpacity={0.4} />
          <Area type="monotone" dataKey="State" stackId="t" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.3} />
          <Area type="monotone" dataKey="IRMAA" stackId="t" stroke="#dc2626" fill="#dc2626" fillOpacity={0.4} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
