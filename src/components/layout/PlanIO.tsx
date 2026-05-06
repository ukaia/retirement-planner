import { useRef, useState } from "react";
import { useStore } from "@/state/store";
import { downloadPlan, parsePlanJson } from "@/state/io";

export function PlanIO() {
  const plan = useStore((s) => s.plan);
  const setPlan = useStore((s) => s.setPlan);
  const resetPlan = useStore((s) => s.resetPlan);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <button
        type="button"
        className="btn-ghost text-xs border border-border"
        onClick={() => downloadPlan(plan)}
      >
        Export JSON
      </button>
      <button
        type="button"
        className="btn-ghost text-xs border border-border"
        onClick={() => fileRef.current?.click()}
      >
        Import JSON
      </button>
      <button
        type="button"
        className="btn-ghost text-xs border border-border text-negative"
        onClick={() => {
          if (window.confirm("Reset all inputs to defaults? This cannot be undone.")) {
            resetPlan();
          }
        }}
      >
        Reset
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const text = await file.text();
          const result = parsePlanJson(text);
          if (result.ok) {
            setPlan(result.plan);
            setError(null);
          } else {
            setError(result.error);
          }
          e.target.value = "";
        }}
      />
      {error ? (
        <span className="text-[11px] text-negative max-w-md truncate" title={error}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
