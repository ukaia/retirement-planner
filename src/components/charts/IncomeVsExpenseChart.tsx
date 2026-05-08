import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProjectionRow } from "@/lib/projection";
import { formatCompact } from "@/lib/formatters";

export function IncomeVsExpenseChart({ rows }: { rows: ProjectionRow[] }) {
  const data = useMemo(
    () =>
      rows.map((r) => ({
        year: r.year,
        Wages: r.wages,
        SS: r.ssP1 + r.ssP2,
        Pensions: r.pensions + r.annuities,
        Rental: r.rentalNet,
        "Part-time": r.partTime,
        "Note P&I": r.installmentInterest + r.installmentPrincipal,
        Withdrawals:
          r.withdrawTaxable + r.withdrawTraditional + r.withdrawRoth + r.withdrawHsa,
        Expenses: -r.expensesTotal,
      })),
    [rows],
  );
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
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
            formatter={(v: number) => formatCompact(Math.abs(v))}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Wages" stackId="income" fill="#2563eb" />
          <Bar dataKey="SS" stackId="income" fill="#0ea5e9" />
          <Bar dataKey="Pensions" stackId="income" fill="#a78bfa" />
          <Bar dataKey="Rental" stackId="income" fill="#22c55e" />
          <Bar dataKey="Part-time" stackId="income" fill="#94a3b8" />
          <Bar dataKey="Note P&I" stackId="income" fill="#f59e0b" />
          <Bar dataKey="Withdrawals" stackId="income" fill="#cbd5e1" />
          <Bar dataKey="Expenses" stackId="expense" fill="#dc2626" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
