export const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "assets", label: "Assets" },
  { id: "income", label: "Income" },
  { id: "expenses", label: "Expenses" },
  { id: "healthcare", label: "Healthcare" },
  { id: "social-security", label: "Social Security" },
  { id: "results", label: "Results" },
  { id: "monte-carlo", label: "Monte Carlo" },
  { id: "sequence-risk", label: "Sequence Risk" },
  { id: "asset-location", label: "Asset Location" },
  { id: "estate", label: "Estate" },
  { id: "comparison", label: "Comparison" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
