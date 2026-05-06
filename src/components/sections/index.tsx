import type { SectionId } from "@/state/sections";
import { SectionStub } from "./SectionStub";
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
      return (
        <SectionStub
          title="Income Streams"
          description="Pensions, annuities, part-time work — for now use Assets → Other for pensions/annuities."
        />
      );
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
