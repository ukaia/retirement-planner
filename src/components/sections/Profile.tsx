import { Card, Field, FieldGrid } from "@/components/inputs/Field";
import { NumberInput } from "@/components/inputs/NumberInput";
import { SegmentedControl } from "@/components/inputs/SegmentedControl";
import { Select } from "@/components/inputs/Select";
import { Toggle } from "@/components/inputs/Toggle";
import { useStore } from "@/state/store";
import type { FilingStatus, TaxYear } from "@/lib/tax-constants";
import { INFLATION_PRESETS } from "@/lib/inflation";
import { PlanIO } from "@/components/layout/PlanIO";
import { Warnings } from "@/components/layout/Warnings";
import { DisclaimerCard } from "@/components/layout/Disclaimer";

const FILING_OPTIONS: { value: FilingStatus; label: string }[] = [
  { value: "single", label: "Single" },
  { value: "mfj", label: "Married filing jointly" },
  { value: "mfs", label: "Married filing separately" },
  { value: "hoh", label: "Head of household" },
  { value: "qss", label: "Qualifying surviving spouse" },
];

const STATE_OPTIONS = [
  { value: "OR", label: "Oregon" },
  { value: "WA", label: "Washington" },
  { value: "AK", label: "Alaska" },
  { value: "ID", label: "Idaho" },
] as const;

const INFLATION_OPTIONS = [
  { value: "reportedAverage", label: "Reported avg (3.1%)" },
  { value: "elevated", label: "Elevated (4.5%)" },
  { value: "high", label: "High (6.0%)" },
  { value: "custom", label: "Custom" },
] as const;

export function Profile() {
  const plan = useStore((s) => s.plan);
  const updatePlan = useStore((s) => s.updatePlan);
  const profile = plan.profile;
  const baseYear = profile.taxYear;
  const p1Age = baseYear - profile.person1.birthYear;
  const p2Age = profile.person2 ? baseYear - profile.person2.birthYear : null;

  const inflationOptionMatch = (() => {
    if (Math.abs(profile.inflation - INFLATION_PRESETS.reportedAverage) < 1e-6) return "reportedAverage";
    if (Math.abs(profile.inflation - INFLATION_PRESETS.elevated) < 1e-6) return "elevated";
    if (Math.abs(profile.inflation - INFLATION_PRESETS.high) < 1e-6) return "high";
    return "custom";
  })();

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
          <p className="mt-1 text-sm text-muted max-w-prose">
            Household details that drive every projection.
          </p>
        </div>
        <PlanIO />
      </header>

      <Warnings />

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <div className="section-title">Single or couple</div>
            <div className="section-subtitle mt-0.5">
              Couple mode duplicates personal inputs for a spouse.
            </div>
          </div>
          <SegmentedControl
            value={profile.mode}
            onChange={(v) =>
              updatePlan((p) => {
                p.profile.mode = v;
                if (v === "couple" && !p.profile.person2) {
                  p.profile.person2 = {
                    birthYear: p.profile.person1.birthYear + 2,
                    retirementAge: 65,
                    currentSalary: 0,
                    salaryGrowth: 0.03,
                    longevityAge: 95,
                  };
                  if (p.profile.filingStatus === "single") p.profile.filingStatus = "mfj";
                  p.socialSecurity.person2 = { pia: 2000, claimAge: 67, alreadyClaiming: false };
                }
                if (v === "single") {
                  p.profile.person2 = undefined;
                  p.socialSecurity.person2 = undefined;
                  if (p.profile.filingStatus === "mfj" || p.profile.filingStatus === "mfs" || p.profile.filingStatus === "qss") {
                    p.profile.filingStatus = "single";
                  }
                }
              })
            }
            options={[
              { value: "single", label: "Single" },
              { value: "couple", label: "Couple" },
            ]}
          />
        </div>
      </Card>

      <Card title="Person 1" subtitle={`Currently age ${p1Age}`}>
        <FieldGrid>
          <Field label="Birth year">
            <NumberInput
              value={profile.person1.birthYear}
              min={1900}
              max={baseYear}
              onChange={(v) => updatePlan((p) => { p.profile.person1.birthYear = v; })}
            />
          </Field>
          <Field label="Target retirement age">
            <NumberInput
              value={profile.person1.retirementAge}
              min={40}
              max={90}
              onChange={(v) => updatePlan((p) => { p.profile.person1.retirementAge = v; })}
            />
          </Field>
          <Field label="Current annual salary">
            <NumberInput
              value={profile.person1.currentSalary}
              prefix="$"
              min={0}
              onChange={(v) => updatePlan((p) => { p.profile.person1.currentSalary = v; })}
            />
          </Field>
          <Field label="Salary growth">
            <NumberInput
              asPercent
              value={profile.person1.salaryGrowth}
              suffix="%"
              min={-0.10}
              max={0.20}
              onChange={(v) => updatePlan((p) => { p.profile.person1.salaryGrowth = v; })}
            />
          </Field>
          <Field label="Plan to age">
            <NumberInput
              value={profile.person1.longevityAge}
              min={60}
              max={120}
              onChange={(v) => updatePlan((p) => { p.profile.person1.longevityAge = v; })}
            />
          </Field>
        </FieldGrid>
      </Card>

      {profile.mode === "couple" && profile.person2 ? (
        <Card title="Person 2" subtitle={p2Age !== null ? `Currently age ${p2Age}` : undefined}>
          <FieldGrid>
            <Field label="Birth year">
              <NumberInput
                value={profile.person2.birthYear}
                min={1900}
                max={baseYear}
                onChange={(v) => updatePlan((p) => { p.profile.person2!.birthYear = v; })}
              />
            </Field>
            <Field label="Target retirement age">
              <NumberInput
                value={profile.person2.retirementAge}
                min={40}
                max={90}
                onChange={(v) => updatePlan((p) => { p.profile.person2!.retirementAge = v; })}
              />
            </Field>
            <Field label="Current annual salary">
              <NumberInput
                value={profile.person2.currentSalary}
                prefix="$"
                min={0}
                onChange={(v) => updatePlan((p) => { p.profile.person2!.currentSalary = v; })}
              />
            </Field>
            <Field label="Salary growth">
              <NumberInput
                asPercent
                value={profile.person2.salaryGrowth}
                suffix="%"
                min={-0.10}
                max={0.20}
                onChange={(v) => updatePlan((p) => { p.profile.person2!.salaryGrowth = v; })}
              />
            </Field>
            <Field label="Plan to age">
              <NumberInput
                value={profile.person2.longevityAge}
                min={60}
                max={120}
                onChange={(v) => updatePlan((p) => { p.profile.person2!.longevityAge = v; })}
              />
            </Field>
          </FieldGrid>
        </Card>
      ) : null}

      <Card title="Household">
        <FieldGrid>
          <Field label="Filing status">
            <Select
              value={profile.filingStatus}
              onChange={(v) => updatePlan((p) => { p.profile.filingStatus = v; })}
              options={FILING_OPTIONS}
            />
          </Field>
          <Field label="State of residence">
            <Select
              value={profile.state}
              onChange={(v) => updatePlan((p) => { p.profile.state = v; })}
              options={[...STATE_OPTIONS]}
            />
          </Field>
          <Field label="Tax year">
            <Select
              value={String(profile.taxYear) as "2025" | "2026"}
              onChange={(v) =>
                updatePlan((p) => {
                  p.profile.taxYear = parseInt(v, 10) as TaxYear;
                })
              }
              options={[
                { value: "2026", label: "2026" },
                { value: "2025", label: "2025" },
              ]}
            />
          </Field>
          <Field label="Inflation assumption">
            <Select
              value={inflationOptionMatch as "reportedAverage" | "elevated" | "high" | "custom"}
              onChange={(v) => {
                if (v === "custom") return;
                updatePlan((p) => {
                  if (v === "reportedAverage") p.profile.inflation = INFLATION_PRESETS.reportedAverage;
                  else if (v === "elevated") p.profile.inflation = INFLATION_PRESETS.elevated;
                  else if (v === "high") p.profile.inflation = INFLATION_PRESETS.high;
                });
              }}
              options={[...INFLATION_OPTIONS]}
            />
          </Field>
          <Field label="Custom inflation rate">
            <NumberInput
              asPercent
              value={profile.inflation}
              suffix="%"
              min={0}
              max={0.20}
              onChange={(v) => updatePlan((p) => { p.profile.inflation = v; })}
            />
          </Field>
          <Field label="Dependents">
            <NumberInput
              value={profile.dependents}
              min={0}
              max={20}
              onChange={(v) => updatePlan((p) => { p.profile.dependents = v; })}
            />
          </Field>
        </FieldGrid>
        <div className="mt-2 text-[11px] text-subtle">
          Default tax year is 2026. Switch to 2025 for current-year planning.
        </div>
      </Card>

      <DisclaimerCard />
    </section>
  );
}

void Toggle;
