import { useMemo } from "react";
import { useStore } from "@/state/store";
import { computeSafeSpend, computeSavingsGap, planWithBaseSpend } from "@/lib/safe-spend";
import { effectiveReturns, projectPlan } from "@/lib/projection";
import { toReal } from "@/lib/inflation";
import { formatCompact, formatCurrency, formatPercent } from "@/lib/formatters";

export function PrintSummary() {
  const plan = useStore((s) => s.plan);
  const displayMode = useStore((s) => s.displayMode);
  const returns = effectiveReturns(plan);

  // Print uses the user's actual method (no MC→drain-zero proxy) so the report
  // is faithful to the chosen scenario. Acceptable to be slow — printing is a
  // one-shot context.
  const safe = useMemo(() => computeSafeSpend(plan), [plan]);
  const rows = useMemo(
    () => projectPlan(planWithBaseSpend(plan, safe.safeSpendToday)),
    [plan, safe.safeSpendToday],
  );

  if (rows.length === 0) {
    return (
      <div className="print-only p-8 text-sm">
        <h1 className="text-xl font-semibold">Retirement Plan Summary</h1>
        <p className="mt-3">Add inputs to populate.</p>
      </div>
    );
  }

  const goal = plan.targetAnnualSpend ?? 0;
  const gap =
    goal > 0
      ? computeSavingsGap({
          plan,
          safe,
          goalToday: goal,
          preferMcAccurate: true,
        })
      : null;

  // Pick a sparse set of milestone rows: retirement, +5y, +10y, +15y, +20y, last.
  const milestones = pickMilestones(rows);

  const p1Name = plan.profile.person1.name ?? "Person 1";
  const p2 = plan.profile.person2;

  const totalLifetimeTax = rows.reduce((s, r) => s + r.totalTax, 0);
  const yearsWithShortfall = rows.filter((r) => r.shortfall > 0).length;

  return (
    <div className="print-only" style={{ color: "#000", background: "#fff", padding: "0" }}>
      <header style={{ borderBottom: "2px solid #000", paddingBottom: 8, marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Retirement Plan Summary</h1>
        <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>
          Generated {new Date().toLocaleDateString()} · State: {plan.profile.state} ·
          Filing: {plan.profile.filingStatus.toUpperCase()} · Tax year: {plan.profile.taxYear}
        </div>
      </header>

      <Section title="Profile">
        <Grid cols={2}>
          <KV
            label={p1Name}
            value={`Born ${plan.profile.person1.birthYear} · retire age ${plan.profile.person1.retirementAge} · plan to ${plan.profile.person1.longevityAge}`}
          />
          {p2 ? (
            <KV
              label={p2.name ?? "Person 2"}
              value={`Born ${p2.birthYear} · retire age ${p2.retirementAge} · plan to ${p2.longevityAge}`}
            />
          ) : null}
          <KV
            label="Inflation"
            value={formatPercent(plan.profile.inflation)}
          />
          <KV
            label="Salary growth"
            value={`${formatPercent(plan.profile.person1.salaryGrowth)}${
              p2 ? ` / ${formatPercent(p2.salaryGrowth)}` : ""
            }`}
          />
        </Grid>
      </Section>

      <Section title="At retirement">
        <Grid cols={4}>
          <KV
            label="Year / age"
            value={`${rows[0].year} · age ${rows[0].p1Age}`}
          />
          <KV
            label="Total assets"
            value={formatCompact(
              rows[0].taxableBalance +
                rows[0].traditionalBalance +
                rows[0].rothBalance +
                rows[0].hsaBalance +
                rows[0].realEstateValue +
                rows[0].otherAssetsValue,
            )}
          />
          <KV
            label="Monthly income"
            value={formatCurrency(
              (rows[0].wages +
                rows[0].ssP1 +
                rows[0].ssP2 +
                rows[0].pensions +
                rows[0].annuities +
                rows[0].rentalNet +
                rows[0].partTime +
                rows[0].installmentInterest +
                rows[0].installmentPrincipal) /
                12,
              { whole: true },
            )}
          />
          <KV
            label="Monthly expense"
            value={formatCurrency(rows[0].expensesTotal / 12, { whole: true })}
          />
        </Grid>
      </Section>

      <Section
        title={`Retirement income breakdown (year ${rows[0].year}, monthly${
          displayMode === "real" ? ", today's $" : ""
        })`}
      >
        <IncomeBreakdownGrid row={rows[0]} displayMode={displayMode} baseYear={plan.profile.taxYear} inflation={plan.profile.inflation} />
      </Section>

      <Section title="Portfolio (at retirement)">
        <Grid cols={4}>
          <KV label="Taxable" value={formatCompact(rows[0].taxableBalance)} />
          <KV label="Traditional" value={formatCompact(rows[0].traditionalBalance)} />
          <KV label="Roth" value={formatCompact(rows[0].rothBalance)} />
          <KV label="HSA" value={formatCompact(rows[0].hsaBalance)} />
          <KV label="Real estate" value={formatCompact(rows[0].realEstateValue)} />
          <KV label="Other" value={formatCompact(rows[0].otherAssetsValue)} />
          <KV label="SS PIA p1" value={formatCompact(plan.socialSecurity.person1.pia * 12)} />
          {plan.socialSecurity.person2 ? (
            <KV
              label="SS PIA p2"
              value={formatCompact(plan.socialSecurity.person2.pia * 12)}
            />
          ) : null}
        </Grid>
      </Section>

      <Section title="Return assumptions (weighted)">
        <Grid cols={4}>
          <KV label="Taxable" value={returns.taxable === null ? "—" : formatPercent(returns.taxable)} />
          <KV
            label="Traditional"
            value={returns.traditional === null ? "—" : formatPercent(returns.traditional)}
          />
          <KV label="Roth" value={returns.roth === null ? "—" : formatPercent(returns.roth)} />
          <KV label="HSA" value={returns.hsa === null ? "—" : formatPercent(returns.hsa)} />
        </Grid>
      </Section>

      <Section title="Sustainability">
        <Grid cols={4}>
          <KV
            label={`Safe spend (today's $, ${methodLabel(plan.safeSpend.method)})`}
            value={formatCurrency(safe.safeSpendToday, { whole: true })}
          />
          <KV
            label="Goal (today's $)"
            value={goal > 0 ? formatCurrency(goal, { whole: true }) : "—"}
          />
          <KV
            label="Shortfall vs goal / yr"
            value={
              goal > 0
                ? goal > safe.safeSpendToday
                  ? formatCurrency(goal - safe.safeSpendToday, { whole: true })
                  : "On track"
                : "—"
            }
          />
          <KV
            label="Extra savings / mo"
            value={
              gap
                ? gap.requiredAnnualContribution > 0
                  ? formatCurrency(gap.requiredAnnualContribution / 12, { whole: true })
                  : "On track"
                : "—"
            }
          />
          <KV
            label="Years with shortfall"
            value={String(yearsWithShortfall)}
          />
        </Grid>
      </Section>

      <Section title="Year-by-year (milestones)">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #000", textAlign: "left" }}>
              <Th>Year</Th>
              <Th>Age</Th>
              <Th>Income</Th>
              <Th>Spend</Th>
              <Th>Tax</Th>
              <Th>Trad</Th>
              <Th>Roth</Th>
              <Th>Taxable</Th>
              <Th>Estate</Th>
            </tr>
          </thead>
          <tbody>
            {milestones.map((r) => (
              <tr key={r.year} style={{ borderBottom: "1px solid #999" }}>
                <Td>{r.year}</Td>
                <Td>{r.p1Age}</Td>
                <Td>
                  {formatCompact(
                    r.wages +
                      r.ssP1 +
                      r.ssP2 +
                      r.pensions +
                      r.annuities +
                      r.rentalNet +
                      r.partTime +
                      r.installmentInterest +
                      r.installmentPrincipal,
                  )}
                </Td>
                <Td>{formatCompact(r.expensesTotal)}</Td>
                <Td>{formatCompact(r.totalTax)}</Td>
                <Td>{formatCompact(r.traditionalBalance)}</Td>
                <Td>{formatCompact(r.rothBalance)}</Td>
                <Td>{formatCompact(r.taxableBalance)}</Td>
                <Td>{formatCompact(r.estateValue)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Bottom line">
        <Grid cols={3}>
          <KV label="Lifetime tax" value={formatCompact(totalLifetimeTax)} />
          <KV label="Final estate" value={formatCompact(rows[rows.length - 1].estateValue)} />
          <KV label="Years modeled" value={String(rows.length)} />
        </Grid>
      </Section>

      <footer style={{ marginTop: 16, paddingTop: 8, borderTop: "1px solid #000", fontSize: 8, color: "#444" }}>
        Estimates only. Not financial, tax, or legal advice. Real returns, taxes,
        healthcare costs, and life events will differ. Verify all figures with a
        qualified professional before acting.
      </footer>
    </div>
  );
}

function methodLabel(m: "monte-carlo" | "drain-zero" | "4pct"): string {
  if (m === "monte-carlo") return "Monte Carlo";
  if (m === "4pct") return "4% rule";
  return "drain-zero";
}

type Row = ReturnType<typeof projectPlan>[number];

function IncomeBreakdownGrid({
  row,
  displayMode,
  baseYear,
  inflation,
}: {
  row: Row;
  displayMode: "nominal" | "real";
  baseYear: number;
  inflation: number;
}) {
  // Print rows are nominal; apply real-$ adjustment here so the section honors
  // the user's display toggle without affecting the rest of the report.
  const adj = (n: number) =>
    displayMode === "real" ? toReal(n, row.year, baseYear, inflation) : n;
  const monthly = (annual: number) => formatCurrency(adj(annual) / 12, { whole: true });
  const ssTotal = row.ssP1 + row.ssP2;
  const otherIncome =
    row.wages + row.pensions + row.annuities + row.rentalNet + row.partTime;
  const noteIncome = row.installmentInterest + row.installmentPrincipal;
  const withdrawals =
    row.withdrawTaxable + row.withdrawTraditional + row.withdrawRoth + row.withdrawHsa;
  const grossIncome = ssTotal + otherIncome + noteIncome + withdrawals;
  return (
    <Grid cols={4}>
      <KV label="Social Security" value={monthly(ssTotal)} />
      <KV label="Wages / pensions / rental" value={monthly(otherIncome)} />
      {noteIncome > 0 ? (
        <KV label="Seller-financed note P&I" value={monthly(noteIncome)} />
      ) : null}
      <KV label="Withdrawals from savings" value={monthly(withdrawals)} />
      <KV label="Gross income" value={monthly(grossIncome)} />
      <KV label="Tax" value={monthly(row.totalTax)} />
      <KV label="Net spending" value={monthly(row.expensesTotal)} />
    </Grid>
  );
}

function pickMilestones(rows: Row[]): Row[] {
  if (rows.length <= 7) return rows;
  const indices = [0];
  for (const offset of [5, 10, 15, 20, 25, 30]) {
    if (offset < rows.length - 1) indices.push(offset);
  }
  indices.push(rows.length - 1);
  return Array.from(new Set(indices)).sort((a, b) => a - b).map((i) => rows[i]);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 10, pageBreakInside: "avoid" }}>
      <h2 style={{ fontSize: 11, fontWeight: 700, margin: "0 0 4px 0", borderBottom: "1px solid #000", paddingBottom: 2 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Grid({ cols, children }: { cols: 2 | 3 | 4; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6 }}>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderLeft: "2px solid #000", paddingLeft: 6 }}>
      <div style={{ fontSize: 8, color: "#444", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 10, fontFamily: "ui-monospace, monospace" }}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "3px 4px", fontWeight: 600 }}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "2px 4px", fontFamily: "ui-monospace, monospace" }}>{children}</td>;
}
