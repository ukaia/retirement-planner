import { Card, Field, FieldGrid } from "@/components/inputs/Field";
import { NumberInput } from "@/components/inputs/NumberInput";
import { SegmentedControl } from "@/components/inputs/SegmentedControl";
import { Toggle } from "@/components/inputs/Toggle";
import { useStore } from "@/state/store";

export function Healthcare() {
  const plan = useStore((s) => s.plan);
  const updatePlan = useStore((s) => s.updatePlan);
  const hc = plan.healthcare;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Healthcare</h1>
        <p className="mt-1 text-sm text-muted max-w-prose">
          Pre-65 (ACA), 65+ (Medicare with optional Medigap), and long-term care projections.
        </p>
      </header>

      <Card title="Pre-65 (ACA marketplace)">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Tier</span>
          <SegmentedControl
            value={hc.acaTier}
            onChange={(v) => updatePlan((p) => { p.healthcare.acaTier = v; })}
            options={[
              { value: "bronze", label: "Bronze" },
              { value: "silver", label: "Silver" },
              { value: "gold", label: "Gold" },
            ]}
          />
        </div>
        <div className="text-[11px] text-subtle">
          Defaults: $450 / $600 / $800 per person per month. Premiums grow ~5.5%/year.
          Premium tax credits are approximated; verify on healthcare.gov.
        </div>
      </Card>

      <Card title="Medicare (65+)">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Include Medigap (Plan G)</span>
          <Toggle
            checked={hc.medigap}
            onChange={(v) => updatePlan((p) => { p.healthcare.medigap = v; })}
          />
        </div>
        <div className="text-[11px] text-subtle">
          Part B base 2026: $202.90/mo. Plan G default: ~$170/mo. IRMAA surcharges
          apply automatically when MAGI two years prior crosses thresholds.
        </div>
      </Card>

      <Card title="Long-term care">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Model expected LTC cost</span>
          <Toggle
            checked={hc.ltc.enabled}
            onChange={(v) => updatePlan((p) => { p.healthcare.ltc.enabled = v; })}
          />
        </div>
        {hc.ltc.enabled ? (
          <>
            <FieldGrid>
              <Field label="Probability of needing care">
                <NumberInput
                  asPercent
                  suffix="%"
                  value={hc.ltc.probability}
                  min={0}
                  max={1}
                  onChange={(v) => updatePlan((p) => { p.healthcare.ltc.probability = v; })}
                />
              </Field>
              <Field label="Annual cost (today's dollars)">
                <NumberInput
                  prefix="$"
                  value={hc.ltc.annualCost}
                  min={0}
                  onChange={(v) => updatePlan((p) => { p.healthcare.ltc.annualCost = v; })}
                />
              </Field>
              <Field label="Average duration (years)">
                <NumberInput
                  value={hc.ltc.durationYears}
                  step={0.5}
                  min={0}
                  max={20}
                  onChange={(v) => updatePlan((p) => { p.healthcare.ltc.durationYears = v; })}
                />
              </Field>
            </FieldGrid>
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-muted">LTC insurance</span>
              <Toggle
                checked={hc.ltc.insurance.enabled}
                onChange={(v) => updatePlan((p) => { p.healthcare.ltc.insurance.enabled = v; })}
              />
            </div>
            {hc.ltc.insurance.enabled ? (
              <FieldGrid>
                <Field label="Annual premium">
                  <NumberInput
                    prefix="$"
                    value={hc.ltc.insurance.annualPremium}
                    min={0}
                    onChange={(v) => updatePlan((p) => { p.healthcare.ltc.insurance.annualPremium = v; })}
                  />
                </Field>
                <Field label="Daily benefit">
                  <NumberInput
                    prefix="$"
                    value={hc.ltc.insurance.dailyBenefit}
                    min={0}
                    onChange={(v) => updatePlan((p) => { p.healthcare.ltc.insurance.dailyBenefit = v; })}
                  />
                </Field>
              </FieldGrid>
            ) : null}
          </>
        ) : null}
      </Card>
    </section>
  );
}
