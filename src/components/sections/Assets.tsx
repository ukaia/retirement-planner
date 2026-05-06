import { Card, Field, FieldGrid } from "@/components/inputs/Field";
import { NumberInput } from "@/components/inputs/NumberInput";
import { Select } from "@/components/inputs/Select";
import { useStore } from "@/state/store";
import { newAssetId } from "@/state/defaults";
import { TIERS, type TierKey } from "@/lib/tax-constants";
import type { Asset } from "@/state/schema";
import { formatCurrency, formatPercent } from "@/lib/formatters";

const TIER_OPTIONS: { value: TierKey; label: string }[] = TIERS.map((t) => ({
  value: t.key,
  label: `${t.label} — ${formatPercent(t.mean, { whole: false })}`,
}));

const CATEGORY_OPTIONS = [
  { value: "trad-401k", label: "Traditional 401(k)" },
  { value: "roth-401k", label: "Roth 401(k)" },
  { value: "trad-ira", label: "Traditional IRA" },
  { value: "roth-ira", label: "Roth IRA" },
  { value: "sep-ira", label: "SEP IRA" },
  { value: "hsa", label: "HSA" },
  { value: "brokerage", label: "Brokerage (taxable)" },
  { value: "real-estate", label: "Real estate" },
  { value: "other", label: "Other (pension/annuity/business/crypto/metals)" },
] as const;

type CategoryValue = typeof CATEGORY_OPTIONS[number]["value"];

export function Assets() {
  const plan = useStore((s) => s.plan);
  const couple = plan.profile.mode === "couple";

  const total = plan.assets.reduce((s, a) => {
    if (a.category === "real-estate") return s + a.marketValue;
    return s + a.balance;
  }, 0);

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Assets</h1>
          <p className="mt-1 text-sm text-muted max-w-prose">
            Add each account, property, or holding. Returns come from the same five tier dropdown for
            every retirement account and brokerage.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">Total today</div>
          <div className="num text-base">{formatCurrency(total, { whole: true })}</div>
        </div>
      </header>

      <div className="space-y-4">
        {plan.assets.length === 0 ? (
          <div className="card text-sm text-muted text-center">
            No assets yet. Use the buttons below to add one.
          </div>
        ) : null}
        {plan.assets.map((a) => (
          <AssetCard key={a.id} asset={a} couple={couple} />
        ))}
      </div>

      <AddAssetMenu />
    </section>
  );
}

function AssetCard({ asset, couple }: { asset: Asset; couple: boolean }) {
  const updatePlan = useStore((s) => s.updatePlan);
  const update = (mut: (a: Asset) => void) =>
    updatePlan((p) => {
      const found = p.assets.find((x) => x.id === asset.id);
      if (found) mut(found);
    });
  const remove = () =>
    updatePlan((p) => {
      p.assets = p.assets.filter((x) => x.id !== asset.id);
    });

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <input
          className="bg-transparent border-0 outline-0 text-sm font-medium focus:bg-surface-2 px-2 -mx-2 rounded flex-1"
          value={asset.nickname ?? ""}
          placeholder={CATEGORY_OPTIONS.find((c) => c.value === asset.category)?.label ?? "Asset"}
          onChange={(ev) => update((a) => { a.nickname = ev.target.value; })}
        />
        <span className="text-[11px] text-subtle">
          {CATEGORY_OPTIONS.find((c) => c.value === asset.category)?.label}
        </span>
        <button type="button" className="text-xs text-subtle hover:text-negative" onClick={remove}>
          Remove
        </button>
      </div>

      {couple ? (
        <Field label="Owner">
          <Select
            value={asset.owner}
            onChange={(v) => update((a) => { a.owner = v; })}
            options={[
              { value: "p1", label: "Person 1" },
              { value: "p2", label: "Person 2" },
              { value: "joint", label: "Joint" },
            ]}
          />
        </Field>
      ) : null}

      {/* Category-specific inputs */}
      {asset.category === "real-estate" ? (
        <RealEstateFields asset={asset} update={update as (mut: (a: Asset) => void) => void} />
      ) : asset.category === "other" ? (
        <OtherFields asset={asset} update={update as (mut: (a: Asset) => void) => void} />
      ) : (
        <FinancialFields asset={asset} update={update as (mut: (a: Asset) => void) => void} />
      )}
    </Card>
  );
}

function FinancialFields({ asset, update }: { asset: Asset; update: (mut: (a: Asset) => void) => void }) {
  if (
    asset.category === "real-estate" ||
    asset.category === "other"
  )
    return null;
  return (
    <FieldGrid>
      <Field label="Current balance">
        <NumberInput
          prefix="$"
          value={asset.balance}
          min={0}
          onChange={(v) =>
            update((a) => {
              if (a.category !== "real-estate" && a.category !== "other") a.balance = v;
            })
          }
        />
      </Field>
      <Field label="Tier">
        <Select
          value={asset.tier.tier}
          onChange={(v) =>
            update((a) => {
              if (a.category !== "real-estate" && a.category !== "other") a.tier.tier = v;
            })
          }
          options={TIER_OPTIONS}
        />
      </Field>
      {asset.tier.tier === "custom" ? (
        <>
          <Field label="Custom return">
            <NumberInput
              asPercent
              suffix="%"
              value={asset.tier.customMean ?? 0.08}
              onChange={(v) =>
                update((a) => {
                  if (a.category !== "real-estate" && a.category !== "other") a.tier.customMean = v;
                })
              }
            />
          </Field>
          <Field label="Custom volatility (stdev)">
            <NumberInput
              asPercent
              suffix="%"
              value={asset.tier.customStdev ?? 0.12}
              onChange={(v) =>
                update((a) => {
                  if (a.category !== "real-estate" && a.category !== "other") a.tier.customStdev = v;
                })
              }
            />
          </Field>
        </>
      ) : null}

      {(asset.category === "trad-401k" || asset.category === "roth-401k") ? (
        <>
          <Field label="Employee contribution % of salary">
            <NumberInput
              asPercent
              suffix="%"
              value={asset.contributionPct ?? 0}
              min={0}
              max={1}
              onChange={(v) =>
                update((a) => {
                  if (a.category === "trad-401k" || a.category === "roth-401k") a.contributionPct = v;
                })
              }
            />
          </Field>
          <Field label="Employer match % of salary">
            <NumberInput
              asPercent
              suffix="%"
              value={asset.employerMatchPct ?? 0}
              min={0}
              max={1}
              onChange={(v) =>
                update((a) => {
                  if (a.category === "trad-401k" || a.category === "roth-401k") a.employerMatchPct = v;
                })
              }
            />
          </Field>
        </>
      ) : null}

      {(asset.category === "trad-ira" ||
        asset.category === "roth-ira" ||
        asset.category === "sep-ira" ||
        asset.category === "hsa") ? (
        <Field label="Annual contribution">
          <NumberInput
            prefix="$"
            value={asset.annualContribution ?? 0}
            min={0}
            onChange={(v) =>
              update((a) => {
                if (
                  a.category === "trad-ira" ||
                  a.category === "roth-ira" ||
                  a.category === "sep-ira" ||
                  a.category === "hsa"
                ) {
                  a.annualContribution = v;
                }
              })
            }
          />
        </Field>
      ) : null}

      {asset.category === "brokerage" ? (
        <>
          <Field label="Monthly contribution">
            <NumberInput
              prefix="$"
              value={asset.monthlyContribution ?? 0}
              min={0}
              onChange={(v) =>
                update((a) => {
                  if (a.category === "brokerage") a.monthlyContribution = v;
                })
              }
            />
          </Field>
          <Field label="Cost basis">
            <NumberInput
              prefix="$"
              value={asset.costBasis ?? 0}
              min={0}
              onChange={(v) =>
                update((a) => {
                  if (a.category === "brokerage") a.costBasis = v;
                })
              }
            />
          </Field>
        </>
      ) : null}
    </FieldGrid>
  );
}

function RealEstateFields({ asset, update }: { asset: Asset; update: (mut: (a: Asset) => void) => void }) {
  if (asset.category !== "real-estate") return null;
  return (
    <FieldGrid>
      <Field label="Subtype">
        <Select
          value={asset.subtype}
          onChange={(v) =>
            update((a) => {
              if (a.category === "real-estate") a.subtype = v;
            })
          }
          options={[
            { value: "primary", label: "Primary residence" },
            { value: "vacation", label: "Vacation" },
            { value: "rental", label: "Rental" },
          ]}
        />
      </Field>
      <Field label="Market value">
        <NumberInput
          prefix="$"
          value={asset.marketValue}
          min={0}
          onChange={(v) =>
            update((a) => {
              if (a.category === "real-estate") a.marketValue = v;
            })
          }
        />
      </Field>
      <Field label="Appreciation">
        <NumberInput
          asPercent
          suffix="%"
          value={asset.appreciation}
          onChange={(v) =>
            update((a) => {
              if (a.category === "real-estate") a.appreciation = v;
            })
          }
        />
      </Field>
      <Field label="Mortgage balance">
        <NumberInput
          prefix="$"
          value={asset.mortgageBalance}
          min={0}
          onChange={(v) =>
            update((a) => {
              if (a.category === "real-estate") a.mortgageBalance = v;
            })
          }
        />
      </Field>
      <Field label="Cost basis">
        <NumberInput
          prefix="$"
          value={asset.basis}
          min={0}
          onChange={(v) =>
            update((a) => {
              if (a.category === "real-estate") a.basis = v;
            })
          }
        />
      </Field>
      <Field label="Action at retirement">
        <Select
          value={asset.actionAtRetirement}
          onChange={(v) =>
            update((a) => {
              if (a.category === "real-estate") a.actionAtRetirement = v;
            })
          }
          options={[
            { value: "hold", label: "Hold" },
            { value: "liquidate", label: "Liquidate at retirement" },
          ]}
        />
      </Field>
      {asset.subtype === "rental" || asset.subtype === "vacation" ? (
        <>
          <Field label="Monthly rent income">
            <NumberInput
              prefix="$"
              value={asset.monthlyRentIncome}
              min={0}
              onChange={(v) =>
                update((a) => {
                  if (a.category === "real-estate") a.monthlyRentIncome = v;
                })
              }
            />
          </Field>
          <Field label="Monthly rent expenses">
            <NumberInput
              prefix="$"
              value={asset.monthlyRentExpense}
              min={0}
              onChange={(v) =>
                update((a) => {
                  if (a.category === "real-estate") a.monthlyRentExpense = v;
                })
              }
            />
          </Field>
        </>
      ) : null}
      {asset.subtype === "rental" ? (
        <Field label="Years owned (depreciation recapture)">
          <NumberInput
            value={asset.yearsOwned}
            min={0}
            onChange={(v) =>
              update((a) => {
                if (a.category === "real-estate") a.yearsOwned = v;
              })
            }
          />
        </Field>
      ) : null}
    </FieldGrid>
  );
}

function OtherFields({ asset, update }: { asset: Asset; update: (mut: (a: Asset) => void) => void }) {
  if (asset.category !== "other") return null;
  return (
    <FieldGrid>
      <Field label="Subtype">
        <Select
          value={asset.subtype}
          onChange={(v) =>
            update((a) => {
              if (a.category === "other") a.subtype = v;
            })
          }
          options={[
            { value: "pension", label: "Pension" },
            { value: "annuity", label: "Annuity" },
            { value: "business", label: "Business equity" },
            { value: "crypto", label: "Crypto" },
            { value: "metals", label: "Precious metals" },
          ]}
        />
      </Field>
      {(asset.subtype === "pension" || asset.subtype === "annuity") ? (
        <>
          <Field label="Monthly benefit">
            <NumberInput
              prefix="$"
              value={asset.monthlyBenefit ?? 0}
              min={0}
              onChange={(v) =>
                update((a) => {
                  if (a.category === "other") a.monthlyBenefit = v;
                })
              }
            />
          </Field>
          <Field label="Start age">
            <NumberInput
              value={asset.startAge ?? 65}
              min={0}
              max={120}
              onChange={(v) =>
                update((a) => {
                  if (a.category === "other") a.startAge = v;
                })
              }
            />
          </Field>
          <Field label="COLA">
            <NumberInput
              asPercent
              suffix="%"
              value={asset.cola ?? 0}
              onChange={(v) =>
                update((a) => {
                  if (a.category === "other") a.cola = v;
                })
              }
            />
          </Field>
        </>
      ) : null}
      {(asset.subtype === "business" || asset.subtype === "crypto" || asset.subtype === "metals") ? (
        <>
          <Field label="Current value">
            <NumberInput
              prefix="$"
              value={asset.balance}
              min={0}
              onChange={(v) =>
                update((a) => {
                  if (a.category === "other") a.balance = v;
                })
              }
            />
          </Field>
          <Field label="Expected return">
            <NumberInput
              asPercent
              suffix="%"
              value={asset.expectedReturn ?? 0.04}
              onChange={(v) =>
                update((a) => {
                  if (a.category === "other") a.expectedReturn = v;
                })
              }
            />
          </Field>
          <Field label="Cost basis">
            <NumberInput
              prefix="$"
              value={asset.costBasis ?? 0}
              min={0}
              onChange={(v) =>
                update((a) => {
                  if (a.category === "other") a.costBasis = v;
                })
              }
            />
          </Field>
        </>
      ) : null}
    </FieldGrid>
  );
}

function AddAssetMenu() {
  const updatePlan = useStore((s) => s.updatePlan);
  const add = (category: CategoryValue) =>
    updatePlan((p) => {
      const id = newAssetId();
      switch (category) {
        case "trad-401k":
        case "roth-401k":
          p.assets.push({
            id,
            owner: "p1",
            category,
            balance: 0,
            contributionPct: 0.10,
            employerMatchPct: 0.04,
            tier: { tier: "balanced" },
          });
          break;
        case "trad-ira":
        case "roth-ira":
        case "sep-ira":
          p.assets.push({
            id,
            owner: "p1",
            category,
            balance: 0,
            annualContribution: 0,
            tier: { tier: "balanced" },
          });
          break;
        case "hsa":
          p.assets.push({
            id,
            owner: "p1",
            category,
            balance: 0,
            annualContribution: 0,
            tier: { tier: "balanced" },
          });
          break;
        case "brokerage":
          p.assets.push({
            id,
            owner: "p1",
            category,
            balance: 0,
            monthlyContribution: 0,
            costBasis: 0,
            tier: { tier: "growth-income" },
          });
          break;
        case "real-estate":
          p.assets.push({
            id,
            owner: "joint",
            category,
            subtype: "primary",
            balance: 0,
            marketValue: 0,
            appreciation: 0.035,
            mortgageBalance: 0,
            basis: 0,
            yearsOwned: 0,
            monthlyRentIncome: 0,
            monthlyRentExpense: 0,
            actionAtRetirement: "hold",
          });
          break;
        case "other":
          p.assets.push({
            id,
            owner: "p1",
            category,
            subtype: "pension",
            balance: 0,
            monthlyBenefit: 2000,
            startAge: 65,
            cola: 0.02,
          });
          break;
      }
    });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {CATEGORY_OPTIONS.map((c) => (
        <button
          key={c.value}
          type="button"
          className="btn-ghost border border-dashed border-border text-xs justify-start truncate"
          onClick={() => add(c.value)}
        >
          + {c.label}
        </button>
      ))}
    </div>
  );
}
