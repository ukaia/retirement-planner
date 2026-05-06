import { Card, Field, FieldGrid } from "@/components/inputs/Field";
import { NumberInput } from "@/components/inputs/NumberInput";
import { Toggle } from "@/components/inputs/Toggle";
import { useStore } from "@/state/store";
import { newAssetId } from "@/state/defaults";
import { formatCurrency } from "@/lib/formatters";

export function Expenses() {
  const plan = useStore((s) => s.plan);
  const updatePlan = useStore((s) => s.updatePlan);
  const expenses = plan.expenses;
  const monthlyTotal = expenses.reduce((s, e) => s + e.monthlyToday, 0);

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Expenses</h1>
          <p className="mt-1 text-sm text-muted max-w-prose">
            Monthly amounts in today&rsquo;s dollars. Each grows at household inflation unless overridden.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">Total / month</div>
          <div className="num text-base">{formatCurrency(monthlyTotal, { whole: true })}</div>
        </div>
      </header>

      <div className="space-y-4">
        {expenses.map((e) => (
          <Card key={e.id}>
            <div className="flex items-center justify-between">
              <input
                className="bg-transparent border-0 outline-0 text-sm font-medium focus:bg-surface-2 px-2 -mx-2 rounded"
                value={e.label}
                onChange={(ev) =>
                  updatePlan((p) => {
                    const found = p.expenses.find((x) => x.id === e.id);
                    if (found) found.label = ev.target.value;
                  })
                }
              />
              <button
                type="button"
                className="text-xs text-subtle hover:text-negative"
                onClick={() =>
                  updatePlan((p) => {
                    p.expenses = p.expenses.filter((x) => x.id !== e.id);
                  })
                }
              >
                Remove
              </button>
            </div>
            <FieldGrid cols={3}>
              <Field label="Monthly today">
                <NumberInput
                  prefix="$"
                  value={e.monthlyToday}
                  min={0}
                  onChange={(v) =>
                    updatePlan((p) => {
                      const found = p.expenses.find((x) => x.id === e.id);
                      if (found) found.monthlyToday = v;
                    })
                  }
                />
              </Field>
              <Field label="Growth (0 = inflation)">
                <NumberInput
                  asPercent
                  suffix="%"
                  value={e.growth}
                  onChange={(v) =>
                    updatePlan((p) => {
                      const found = p.expenses.find((x) => x.id === e.id);
                      if (found) found.growth = v;
                    })
                  }
                />
              </Field>
              <Field label="Phase out at age (optional)">
                <NumberInput
                  value={e.phaseOutAtAge ?? 0}
                  min={0}
                  max={120}
                  onChange={(v) =>
                    updatePlan((p) => {
                      const found = p.expenses.find((x) => x.id === e.id);
                      if (found) found.phaseOutAtAge = v > 0 ? v : null;
                    })
                  }
                />
              </Field>
            </FieldGrid>
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted">Step change</span>
              <Toggle
                checked={e.stepChange !== null}
                onChange={(v) =>
                  updatePlan((p) => {
                    const found = p.expenses.find((x) => x.id === e.id);
                    if (!found) return;
                    found.stepChange = v ? { atAge: 75, multiplier: 0.6 } : null;
                  })
                }
              />
            </div>
            {e.stepChange ? (
              <FieldGrid cols={2}>
                <Field label="At age">
                  <NumberInput
                    value={e.stepChange.atAge}
                    min={0}
                    max={120}
                    onChange={(v) =>
                      updatePlan((p) => {
                        const found = p.expenses.find((x) => x.id === e.id);
                        if (found?.stepChange) found.stepChange.atAge = v;
                      })
                    }
                  />
                </Field>
                <Field label="Multiplier (0.6 = 40% drop)">
                  <NumberInput
                    value={e.stepChange.multiplier}
                    min={0}
                    max={5}
                    step={0.1}
                    onChange={(v) =>
                      updatePlan((p) => {
                        const found = p.expenses.find((x) => x.id === e.id);
                        if (found?.stepChange) found.stepChange.multiplier = v;
                      })
                    }
                  />
                </Field>
              </FieldGrid>
            ) : null}
          </Card>
        ))}
      </div>

      <button
        type="button"
        className="btn-ghost border border-dashed border-border w-full"
        onClick={() =>
          updatePlan((p) => {
            p.expenses.push({
              id: newAssetId("exp"),
              label: "New category",
              monthlyToday: 0,
              growth: 0,
              startAge: null,
              endAge: null,
              phaseOutAtAge: null,
              stepChange: null,
            });
          })
        }
      >
        + Add expense category
      </button>
    </section>
  );
}
