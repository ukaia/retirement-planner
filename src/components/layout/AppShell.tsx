import type { ReactNode } from "react";
import { LeftRail } from "./LeftRail";
import { RightRailSummary } from "./RightRailSummary";
import { MobileTabs } from "./MobileTabs";
import { useApplyTheme } from "./ThemeToggle";

export function AppShell({ children }: { children: ReactNode }) {
  useApplyTheme();
  return (
    <div className="h-full w-full flex flex-col md:flex-row bg-bg text-fg">
      <LeftRail />
      <main className="flex-1 min-w-0 overflow-y-auto pb-16 md:pb-0">
        <div className="max-w-3xl mx-auto px-5 py-6 md:px-8 md:py-10">
          {children}
        </div>
      </main>
      <RightRailSummary />
      <MobileTabs />
    </div>
  );
}
