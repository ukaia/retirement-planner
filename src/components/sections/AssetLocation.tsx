import { useMemo } from "react";
import { Card } from "@/components/inputs/Field";
import { useStore } from "@/state/store";
import { allocationByBucket, locationScore, type BucketKey } from "@/lib/asset-location";
import { TIERS, type TierKey } from "@/lib/tax-constants";
import { formatCompact, formatPercent } from "@/lib/formatters";
import { Term } from "@/components/inputs/Term";

export function AssetLocation() {
  const plan = useStore((s) => s.plan);
  const alloc = useMemo(() => allocationByBucket(plan), [plan]);
  const score = useMemo(() => locationScore(plan), [plan]);

  const total =
    alloc.taxable.balance + alloc.traditional.balance + alloc.roth.balance + alloc.hsa.balance;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Asset Location</h1>
        <p className="mt-1 text-sm text-muted max-w-prose">
          <Term k="assetLocation">Asset location</Term> is the strategy of placing investments in
          the most tax-efficient account type. This view scores your placement and flags the
          easiest swaps.
        </p>
      </header>

      <Card title="Score">
        <div className="flex items-end gap-3">
          <div className="num text-3xl">{score.score}</div>
          <div className="text-sm text-muted mb-1">/ 100</div>
        </div>
        <div className="h-2 rounded-full bg-border overflow-hidden">
          <div
            className="h-full bg-accent"
            style={{ width: `${score.score}%` }}
            aria-label={`Asset-location score ${score.score} out of 100`}
          />
        </div>
        <div className="text-[11px] text-subtle mt-2">
          Heuristic — placeholder until per-asset tax-drag modeling lands.
        </div>
      </Card>

      <Card title="Allocation by tax type">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <BucketCard label="Taxable" alloc={alloc.taxable} total={total} />
          <BucketCard label="Traditional" alloc={alloc.traditional} total={total} />
          <BucketCard label="Roth" alloc={alloc.roth} total={total} />
          <BucketCard label="HSA" alloc={alloc.hsa} total={total} />
        </div>
      </Card>

      <Card title="Rules of thumb">
        <ul className="text-sm text-muted space-y-2 list-disc list-inside">
          <li>High-growth equities → <strong className="text-fg">Roth</strong>, where gains compound tax-free.</li>
          <li>High-yield bonds and REITs → <strong className="text-fg">Traditional</strong>, deferring ordinary income tax.</li>
          <li>Tax-efficient index funds → <strong className="text-fg">Taxable</strong>, paying favorable LTCG rates.</li>
          <li>HSA: highest-growth, planned for late-life qualified medical use.</li>
        </ul>
      </Card>

      {score.suggestions.length > 0 ? (
        <Card title="Suggestions">
          <ul className="text-sm text-fg space-y-2 list-disc list-inside">
            {score.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}

function BucketCard({
  label,
  alloc,
  total,
}: {
  label: string;
  alloc: ReturnType<typeof allocationByBucket>[BucketKey];
  total: number;
}) {
  const pct = total > 0 ? alloc.balance / total : 0;
  return (
    <div className="card !p-4 space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted">{label}</span>
        <span className="text-[10px] text-subtle">{formatPercent(pct)}</span>
      </div>
      <div className="num text-base">{formatCompact(alloc.balance)}</div>
      <div className="text-[11px] text-subtle">
        Avg return:{" "}
        <span className="num">{formatPercent(alloc.weightedReturn)}</span>
      </div>
      {alloc.balance > 0 ? (
        <div className="space-y-1 mt-2">
          {(Object.keys(alloc.tiers) as TierKey[])
            .filter((t) => alloc.tiers[t] > 0)
            .map((t) => {
              const def = TIERS.find((x) => x.key === t);
              const slice = alloc.tiers[t] / alloc.balance;
              return (
                <div key={t} className="flex items-center justify-between text-[10px]">
                  <span className="text-muted truncate">{def?.label ?? t}</span>
                  <span className="num">{formatPercent(slice)}</span>
                </div>
              );
            })}
        </div>
      ) : null}
    </div>
  );
}
