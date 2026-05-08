import { useMemo } from "react";
import { useStore } from "@/state/store";
import { useProjection } from "@/state/selectors";
import { planWarnings, irmaaCliffWarnings, type Warning } from "@/lib/warnings";

export function Warnings() {
  const plan = useStore((s) => s.plan);
  const rows = useProjection();
  const warnings = useMemo<Warning[]>(
    () => [...planWarnings(plan), ...irmaaCliffWarnings(plan, rows)],
    [plan, rows],
  );
  if (warnings.length === 0) return null;
  return (
    <div className="space-y-2">
      {warnings.map((w, i) => (
        <div
          key={i}
          className={`text-[12px] rounded-md border px-3 py-2 ${
            w.level === "warn"
              ? "border-negative/40 bg-negative/5 text-negative"
              : "border-border bg-surface-2 text-muted"
          }`}
        >
          {w.text}
        </div>
      ))}
    </div>
  );
}
