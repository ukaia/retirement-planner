import { Card, Field, FieldGrid } from "@/components/inputs/Field";
import { NumberInput } from "@/components/inputs/NumberInput";
import { Select } from "@/components/inputs/Select";
import { useStore } from "@/state/store";
import { newAssetId } from "@/state/defaults";
import { formatCurrency } from "@/lib/formatters";

const TAXABILITY_OPTIONS = [
  { value: "ordinary", label: "Ordinary income" },
  { value: "ltcg", label: "Long-term capital gains" },
  { value: "tax-free", label: "Tax-free" },
  { value: "partial-ss", label: "Partial SS-like (85% taxable)" },
] as const;

export function Income() {
  const plan = useStore((s) => s.plan);
  const updatePlan = useStore((s) => s.updatePlan);
  const couple = plan.profile.mode === "couple";
  const streams = plan.incomeStreams;
  const monthlyTotal = streams.reduce((s, x) => s + x.monthlyAmount, 0);

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Income Streams</h1>
          <p className="mt-1 text-sm text-muted max-w-prose">
            Part-time work, royalties, board fees, deferred compensation, or any other ongoing
            income that&rsquo;s not a pension/annuity (use Assets → Other for those) and not Social
            Security. Each stream has its own start/end age and tax treatment.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">Total / month today</div>
          <div className="num text-base">{formatCurrency(monthlyTotal, { whole: true })}</div>
        </div>
      </header>

      <div className="space-y-4">
        {streams.length === 0 ? (
          <div className="card text-sm text-muted text-center">
            No income streams yet. Add one below.
          </div>
        ) : null}
        {streams.map((s) => (
          <Card key={s.id}>
            <div className="flex items-center justify-between gap-2">
              <input
                className="bg-transparent border-0 outline-0 text-sm font-medium focus:bg-surface-2 px-2 -mx-2 rounded flex-1"
                value={s.label}
                placeholder="Income stream"
                onChange={(ev) =>
                  updatePlan((p) => {
                    const found = p.incomeStreams.find((x) => x.id === s.id);
                    if (found) found.label = ev.target.value;
                  })
                }
              />
              <button
                type="button"
                className="text-xs text-subtle hover:text-negative"
                onClick={() =>
                  updatePlan((p) => {
                    p.incomeStreams = p.incomeStreams.filter((x) => x.id !== s.id);
                  })
                }
              >
                Remove
              </button>
            </div>

            <FieldGrid cols={3}>
              {couple ? (
                <Field label="Owner">
                  <Select
                    value={s.owner}
                    onChange={(v) =>
                      updatePlan((p) => {
                        const found = p.incomeStreams.find((x) => x.id === s.id);
                        if (found) found.owner = v;
                      })
                    }
                    options={[
                      { value: "p1", label: "Person 1" },
                      { value: "p2", label: "Person 2" },
                      { value: "joint", label: "Joint" },
                    ]}
                  />
                </Field>
              ) : null}

              <Field label="Monthly amount today">
                <NumberInput
                  prefix="$"
                  value={s.monthlyAmount}
                  min={0}
                  onChange={(v) =>
                    updatePlan((p) => {
                      const found = p.incomeStreams.find((x) => x.id === s.id);
                      if (found) found.monthlyAmount = v;
                    })
                  }
                />
              </Field>

              <Field label="Start age">
                <NumberInput
                  value={s.startAge}
                  min={0}
                  max={120}
                  onChange={(v) =>
                    updatePlan((p) => {
                      const found = p.incomeStreams.find((x) => x.id === s.id);
                      if (found) found.startAge = v;
                    })
                  }
                />
              </Field>

              <Field label="End age (0 = lifetime)">
                <NumberInput
                  value={s.endAge ?? 0}
                  min={0}
                  max={120}
                  onChange={(v) =>
                    updatePlan((p) => {
                      const found = p.incomeStreams.find((x) => x.id === s.id);
                      if (found) found.endAge = v > 0 ? v : null;
                    })
                  }
                />
              </Field>

              <Field label="Growth (0 = inflation)">
                <NumberInput
                  asPercent
                  suffix="%"
                  value={s.growth}
                  onChange={(v) =>
                    updatePlan((p) => {
                      const found = p.incomeStreams.find((x) => x.id === s.id);
                      if (found) found.growth = v;
                    })
                  }
                />
              </Field>

              <Field label="Tax treatment">
                <Select
                  value={s.taxability}
                  onChange={(v) =>
                    updatePlan((p) => {
                      const found = p.incomeStreams.find((x) => x.id === s.id);
                      if (found) found.taxability = v;
                    })
                  }
                  options={[...TAXABILITY_OPTIONS]}
                />
              </Field>
            </FieldGrid>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          type="button"
          className="btn-ghost border border-dashed border-border text-xs justify-start"
          onClick={() =>
            updatePlan((p) => {
              p.incomeStreams.push({
                id: newAssetId("inc"),
                label: "Part-time consulting",
                owner: "p1",
                monthlyAmount: 3000,
                startAge: p.profile.person1.retirementAge,
                endAge: p.profile.person1.retirementAge + 5,
                growth: 0,
                taxability: "ordinary",
              });
            })
          }
        >
          + Part-time consulting
        </button>
        <button
          type="button"
          className="btn-ghost border border-dashed border-border text-xs justify-start"
          onClick={() =>
            updatePlan((p) => {
              p.incomeStreams.push({
                id: newAssetId("inc"),
                label: "Royalties",
                owner: "p1",
                monthlyAmount: 500,
                startAge: p.profile.person1.retirementAge,
                endAge: null,
                growth: 0,
                taxability: "ordinary",
              });
            })
          }
        >
          + Royalties
        </button>
        <button
          type="button"
          className="btn-ghost border border-dashed border-border text-xs justify-start"
          onClick={() =>
            updatePlan((p) => {
              p.incomeStreams.push({
                id: newAssetId("inc"),
                label: "Board fees",
                owner: "p1",
                monthlyAmount: 2000,
                startAge: p.profile.person1.retirementAge,
                endAge: p.profile.person1.retirementAge + 10,
                growth: 0,
                taxability: "ordinary",
              });
            })
          }
        >
          + Board fees
        </button>
        <button
          type="button"
          className="btn-ghost border border-dashed border-border text-xs justify-start"
          onClick={() =>
            updatePlan((p) => {
              p.incomeStreams.push({
                id: newAssetId("inc"),
                label: "New stream",
                owner: "p1",
                monthlyAmount: 0,
                startAge: p.profile.person1.retirementAge,
                endAge: null,
                growth: 0,
                taxability: "ordinary",
              });
            })
          }
        >
          + Custom
        </button>
      </div>

      <p className="text-[11px] text-subtle max-w-prose">
        Tax treatment notes: <strong className="text-fg">Ordinary</strong> flows through federal +
        state ordinary brackets. <strong className="text-fg">LTCG</strong> uses the long-term
        capital gains stack. <strong className="text-fg">Tax-free</strong> bypasses both. Pensions
        and annuities should be added under Assets → Other so their start age, COLA, and survivor
        rules apply.
      </p>
    </section>
  );
}
