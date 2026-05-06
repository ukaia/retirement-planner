import type { SectionId } from "@/state/sections";
import { Profile } from "./Profile";
import { Assets } from "./Assets";
import { Expenses } from "./Expenses";
import { Healthcare } from "./Healthcare";
import { SocialSecurity } from "./SocialSecurity";
import { Results } from "./Results";
import { MonteCarlo } from "./MonteCarlo";
import { Estate } from "./Estate";
import { SequenceRisk } from "./SequenceRisk";
import { AssetLocation } from "./AssetLocation";
import { Comparison } from "./Comparison";
import { Income } from "./Income";

export function SectionRenderer({ id }: { id: SectionId }) {
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
