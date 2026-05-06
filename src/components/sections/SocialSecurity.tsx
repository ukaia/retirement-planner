import { Card, Field, FieldGrid } from "@/components/inputs/Field";
import { NumberInput } from "@/components/inputs/NumberInput";
import { Slider } from "@/components/inputs/Slider";
import { Toggle } from "@/components/inputs/Toggle";
import { useStore } from "@/state/store";
import { benefitAtClaimAge, buildClaimHeatmap } from "@/lib/social-security";
import { formatCurrency, formatCompact } from "@/lib/formatters";
import { useMemo } from "react";
import { Term } from "@/components/inputs/Term";

export function SocialSecurity() {
  const plan = useStore((s) => s.plan);
  const updatePlan = useStore((s) => s.updatePlan);
  const ss = plan.socialSecurity;
  const couple = plan.profile.mode === "couple" && plan.profile.person2 && ss.person2;

  const heatmap = useMemo(() => {
    if (!couple) {
      return buildClaimHeatmap({
        person1: {
          pia: ss.person1.pia,
          birthYear: plan.profile.person1.birthYear,
          longevityAge: plan.profile.person1.longevityAge,
        },
      });
    }
    return buildClaimHeatmap({
      person1: {
        pia: ss.person1.pia,
        birthYear: plan.profile.person1.birthYear,
        longevityAge: plan.profile.person1.longevityAge,
      },
      person2: {
        pia: ss.person2!.pia,
        birthYear: plan.profile.person2!.birthYear,
        longevityAge: plan.profile.person2!.longevityAge,
      },
    });
  }, [couple, ss, plan.profile]);

  const max = Math.max(...heatmap.values.flat());
  const min = Math.min(...heatmap.values.flat());

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Social Security</h1>
        <p className="mt-1 text-sm text-muted max-w-prose">
          Enter your <Term k="pia">PIA</Term> at <Term k="fra">FRA</Term>. Get this from{" "}
          <a className="underline underline-offset-2" href="https://ssa.gov/myaccount" target="_blank" rel="noreferrer">
            ssa.gov/myaccount
          </a>
          . Adjust your claim age to see lifetime benefit changes;{" "}
          <Term k="drc">delayed retirement credits</Term> add 8% per year past FRA.
        </p>
      </header>

      <Card title="Person 1">
        <FieldGrid>
          <Field label="PIA at FRA (monthly)">
            <NumberInput
              prefix="$"
              value={ss.person1.pia}
              min={0}
              max={6_000}
              onChange={(v) => updatePlan((p) => { p.socialSecurity.person1.pia = v; })}
            />
          </Field>
          <Field label={`Claim age: ${ss.person1.claimAge}`}>
            <Slider
              ariaLabel="Claim age person 1"
              min={62}
              max={70}
              step={1}
              value={ss.person1.claimAge}
              onChange={(v) => updatePlan((p) => { p.socialSecurity.person1.claimAge = v; })}
            />
          </Field>
        </FieldGrid>
        <div className="text-xs text-muted">
          Monthly benefit at claim age:{" "}
          <span className="num">
            {formatCurrency(
              benefitAtClaimAge({
                pia: ss.person1.pia,
                claimAgeMonths: ss.person1.claimAge * 12,
                birthYear: plan.profile.person1.birthYear,
              }),
              { whole: true },
            )}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Already claiming</span>
          <Toggle
            checked={ss.person1.alreadyClaiming}
            onChange={(v) => updatePlan((p) => { p.socialSecurity.person1.alreadyClaiming = v; })}
          />
        </div>
      </Card>

      {couple && ss.person2 ? (
        <Card title="Person 2">
          <FieldGrid>
            <Field label="PIA at FRA (monthly)">
              <NumberInput
                prefix="$"
                value={ss.person2.pia}
                min={0}
                max={6_000}
                onChange={(v) => updatePlan((p) => { p.socialSecurity.person2!.pia = v; })}
              />
            </Field>
            <Field label={`Claim age: ${ss.person2.claimAge}`}>
              <Slider
                ariaLabel="Claim age person 2"
                min={62}
                max={70}
                step={1}
                value={ss.person2.claimAge}
                onChange={(v) => updatePlan((p) => { p.socialSecurity.person2!.claimAge = v; })}
              />
            </Field>
          </FieldGrid>
          <div className="text-xs text-muted">
            Monthly benefit at claim age:{" "}
            <span className="num">
              {formatCurrency(
                benefitAtClaimAge({
                  pia: ss.person2.pia,
                  claimAgeMonths: ss.person2.claimAge * 12,
                  birthYear: plan.profile.person2!.birthYear,
                }),
                { whole: true },
              )}
            </span>
          </div>
        </Card>
      ) : null}

      <Card title="Lifetime benefit heatmap" subtitle={couple ? "P1 claim age × P2 claim age" : "P1 claim age × longevity"}>
        <div className="overflow-x-auto">
          <table className="num text-[11px] border-collapse w-full">
            <thead>
              <tr>
                <th className="text-left text-subtle pr-3">{couple ? "P1 \\ P2" : "P1 age"}</th>
                {heatmap.ages.map((a) => (
                  <th key={a} className="px-2 py-1 text-right text-subtle font-normal">{a}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmap.values.map((row, i) => (
                <tr key={i}>
                  <td className="text-subtle pr-3 py-0.5">{heatmap.ages[i]}</td>
                  {row.map((v, j) => {
                    const t = max === min ? 0 : (v - min) / (max - min);
                    const bgAlpha = (t * 0.35).toFixed(2);
                    return (
                      <td
                        key={j}
                        className="px-2 py-0.5 text-right"
                        style={{ background: `rgba(37, 99, 235, ${bgAlpha})` }}
                      >
                        {formatCompact(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[11px] text-subtle">
          Darker cells = higher cumulative lifetime benefits. Tradition is to delay if longevity is high.
        </div>
      </Card>
    </section>
  );
}
