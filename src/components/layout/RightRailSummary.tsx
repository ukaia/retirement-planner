import { useAtRetirementSummary } from "@/state/selectors";
import { useStore } from "@/state/store";
import { formatCompact, formatCurrency } from "@/lib/formatters";
import { SegmentedControl } from "@/components/inputs/SegmentedControl";

export function RightRailSummary() {
  const summary = useAtRetirementSummary();
  const displayMode = useStore((s) => s.displayMode);
  const setDisplayMode = useStore((s) => s.setDisplayMode);

  return (
    <aside className="no-print hidden xl:flex xl:flex-col xl:w-80 shrink-0 border-l border-border bg-surface">
      <div className="px-5 py-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="section-title">Live Summary</div>
            <div className="section-subtitle mt-0.5">
              Updates as you edit
            </div>
          </div>
          <SegmentedControl
            value={displayMode}
            onChange={setDisplayMode}
            options={[
              { value: "nominal", label: "Nominal" },
              { value: "real", label: "Real" },
            ]}
          />
        </div>
      </div>
      <div className="divider mx-5" />
      <div className="px-5 py-5 flex-1 overflow-y-auto">
        {summary ? (
          <div className="space-y-5 text-sm">
            <SummaryRow
              label="At retirement"
              value={`age ${summary.ageAtRetirement} (${summary.yearOfRetirement})`}
            />
            <SummaryRow
              label="Total assets"
              value={formatCompact(summary.totalAssets)}
            />
            <SummaryRow
              label="Monthly income"
              value={formatCurrency(summary.monthlyIncome, { whole: true })}
            />
            <SummaryRow
              label="Monthly expense"
              value={formatCurrency(summary.monthlyExpense, { whole: true })}
            />
            <SummaryRow
              label="Gap"
              value={formatCurrency(summary.gap, { whole: true })}
              tone={summary.gap < 0 ? "negative" : "positive"}
            />
            <div className="divider" />
            <SummaryRow
              label="Estate at end"
              value={formatCompact(summary.finalEstate)}
              tone={summary.finalEstate <= 0 ? "negative" : undefined}
            />
            <SummaryRow
              label="Years with shortfall"
              value={String(summary.yearsWithShortfall)}
              tone={summary.yearsWithShortfall > 0 ? "negative" : undefined}
            />
          </div>
        ) : (
          <p className="text-xs text-subtle">Enter Profile and Assets to populate.</p>
        )}
      </div>
    </aside>
  );
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  const color =
    tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-fg";
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-muted">{label}</span>
      <span className={`num text-sm ${color}`}>{value}</span>
    </div>
  );
}
