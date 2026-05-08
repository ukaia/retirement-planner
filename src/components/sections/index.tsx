import { lazy, Suspense } from "react";
import type { SectionId } from "@/state/sections";
import { Profile } from "./Profile";
import { Assets } from "./Assets";
import { Expenses } from "./Expenses";
import { Healthcare } from "./Healthcare";
import { SocialSecurity } from "./SocialSecurity";
import { Estate } from "./Estate";
import { AssetLocation } from "./AssetLocation";
import { Income } from "./Income";

const Results = lazy(() => import("./Results").then((m) => ({ default: m.Results })));
const Calculations = lazy(() =>
  import("./Calculations").then((m) => ({ default: m.Calculations })),
);
const MonteCarlo = lazy(() =>
  import("./MonteCarlo").then((m) => ({ default: m.MonteCarlo })),
);
const SequenceRisk = lazy(() =>
  import("./SequenceRisk").then((m) => ({ default: m.SequenceRisk })),
);
const Comparison = lazy(() =>
  import("./Comparison").then((m) => ({ default: m.Comparison })),
);

export function SectionRenderer({ id }: { id: SectionId }) {
  return (
    <Suspense fallback={<SectionLoading />}>
      <SectionBody id={id} />
    </Suspense>
  );
}

function SectionBody({ id }: { id: SectionId }) {
  switch (id) {
    case "profile":
      return <Profile />;
    case "assets":
      return <Assets />;
    case "expenses":
      return <Expenses />;
    case "healthcare":
      return <Healthcare />;
    case "social-security":
      return <SocialSecurity />;
    case "income":
      return <Income />;
    case "results":
      return <Results />;
    case "calculations":
      return <Calculations />;
    case "monte-carlo":
      return <MonteCarlo />;
    case "sequence-risk":
      return <SequenceRisk />;
    case "asset-location":
      return <AssetLocation />;
    case "estate":
      return <Estate />;
    case "comparison":
      return <Comparison />;
  }
}

function SectionLoading() {
  return <div className="text-sm text-subtle py-8">Loading…</div>;
}
