import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { LeftRail } from "./LeftRail";
import { RightRailSummary } from "./RightRailSummary";
import { MobileTabs } from "./MobileTabs";
import { useApplyTheme } from "./ThemeToggle";

const PrintSummary = lazy(() =>
  import("./PrintSummary").then((m) => ({ default: m.PrintSummary })),
);

export function AppShell({ children }: { children: ReactNode }) {
  useApplyTheme();
  const printReady = usePrintReady();
  return (
    <>
      <div className="screen-only h-full w-full flex flex-col md:flex-row bg-bg text-fg">
        <LeftRail />
        <main className="flex-1 min-w-0 overflow-y-auto pb-16 md:pb-0">
          <div className="max-w-3xl mx-auto px-5 py-6 md:px-8 md:py-10">
            {children}
          </div>
        </main>
        <RightRailSummary />
        <MobileTabs />
      </div>
      {printReady ? (
        <Suspense fallback={null}>
          <PrintSummary />
        </Suspense>
      ) : null}
    </>
  );
}

// Defer PrintSummary off the initial render path. Mount it on `beforeprint`
// (so Cmd/Ctrl-P still includes it once the chunk loads) and as a fallback
// pre-warm it during idle time so subsequent prints are instant.
function usePrintReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    const onBeforePrint = () => setReady(true);
    window.addEventListener("beforeprint", onBeforePrint);

    let idleHandle: number | undefined;
    let timeoutHandle: number | undefined;
    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(() => setReady(true), { timeout: 4000 });
    } else {
      timeoutHandle = window.setTimeout(() => setReady(true), 2000);
    }

    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      if (idleHandle !== undefined && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
    };
  }, [ready]);
  return ready;
}
