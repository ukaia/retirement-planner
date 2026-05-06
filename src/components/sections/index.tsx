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
      return <SectionStub title="Sequence-of-Returns Risk" description="Coming soon." />;
    case "asset-location":
      return <SectionStub title="Asset Location" description="Coming soon." />;
    case "estate":
      return <Estate />;
    case "comparison":
      return <SectionStub title="Comparison" description="Coming soon." />;
  }
}
