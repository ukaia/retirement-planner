import { Card, Field, FieldGrid } from "@/components/inputs/Field";
import { NumberInput } from "@/components/inputs/NumberInput";
import { Toggle } from "@/components/inputs/Toggle";
import { useStore } from "@/state/store";
import { useProjection } from "@/state/selectors";
import { computeEstate, gifting } from "@/lib/estate";
import { formatCompact, formatCurrency } from "@/lib/formatters";
import { useState } from "react";
import { Term } from "@/components/inputs/Term";

export function Estate() {
  const plan = useStore((s) => s.plan);
  const rows = useProjection();
  const [beneficiaries, setBeneficiaries] = useState(2);
  const [giftSplit, setGiftSplit] = useState(false);

  const finalEstate = rows.length > 0 ? rows[rows.length - 1].estateValue : 0;
  const breakdown = computeEstate({
    estateValue: finalEstate,
    filingStatus: plan.profile.filingStatus,
    state: plan.profile.state,
    beneficiaries,
    year: plan.profile.taxYear,
  });

  const yearsRemaining = Math.max(
    0,
    plan.profile.person1.longevityAge - (plan.profile.taxYear - plan.profile.person1.birthYear),
  );
  const cumulativeGifts = gifting({ beneficiaries, yearsRemaining, giftSplit });

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Estate Planning</h1>
        <p className="mt-1 text-sm text-muted max-w-prose">
          Federal exemption, state estate tax (Oregon and Washington only), and annual-exclusion gifting.
        </p>
      </header>

      <Card title="Inputs">
        <FieldGrid>
          <Field label="Beneficiaries">
            <NumberInput value={beneficiaries} min={1} max={20} onChange={setBeneficiaries} />
          </Field>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Spouse gift-splitting</span>
            <Toggle checked={giftSplit} onChange={setGiftSplit} />
          </div>
        </FieldGrid>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Estate at death (median)" value={formatCompact(finalEstate)} />
        <Stat label="Federal exemption" value={formatCompact(breakdown.federalExemption)} />
        <Stat label="Federal estate tax" value={formatCompact(breakdown.federalEstateTax)} tone={breakdown.federalEstateTax > 0 ? "negative" : undefined} />
        <Stat label="State estate tax" value={formatCompact(breakdown.stateEstateTax)} tone={breakdown.stateEstateTax > 0 ? "negative" : undefined} />
      </div>

      <Card title="After-tax inheritance">
        <Stat label="Net to heirs" value={formatCurrency(breakdown.netInheritance, { whole: true })} />
        <Stat label="Per beneficiary" value={formatCurrency(breakdown.perBeneficiary, { whole: true })} />
      </Card>

      <Card title="Annual-exclusion gifting" subtitle={`Over ${yearsRemaining} years to ${beneficiaries} beneficiaries`}>
        <Stat
          label="Cumulative tax-free transfer (in addition to estate)"
          value={formatCurrency(cumulativeGifts, { whole: true })}
        />
        <div className="text-[11px] text-subtle mt-2">
          $19,000 per recipient annually (2026), doubled with spouse gift-splitting.
        </div>
      </Card>

      <Card title="Stretch IRA (for heirs)">
        <p className="text-sm text-muted">
          Under SECURE Act, most non-spouse beneficiaries must drain inherited IRAs within 10 years
          (the new <Term k="stretchIra">stretch IRA</Term> limit). Heirs in high-tax-bracket years
          can face large income-tax bills. Consider a{" "}
          <Term k="rothConversion">Roth conversion</Term> ladder if leaving significant traditional
          balances to non-spouse heirs. Non-retirement assets get a{" "}
          <Term k="stepUpBasis">step-up in basis</Term> at death.
        </p>
      </Card>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "negative" }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-muted">{label}</span>
      <span className={`num text-sm ${tone === "negative" ? "text-negative" : ""}`}>{value}</span>
    </div>
  );
}
