import { SECTIONS } from "@/state/sections";
import { useUIStore } from "@/state/store";

const PRIMARY_IDS = [
  "profile",
  "assets",
  "expenses",
  "results",
  "monte-carlo",
] as const;

export function MobileTabs() {
  const active = useUIStore((s) => s.activeSection);
  const setActive = useUIStore((s) => s.setActiveSection);
  const primary = SECTIONS.filter((s) => (PRIMARY_IDS as readonly string[]).includes(s.id));
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
      <div className="grid grid-cols-5">
        {primary.map((s) => {
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={[
                "py-2.5 text-[11px] flex flex-col items-center gap-0.5 transition-colors",
                "min-h-[44px]",
                isActive ? "text-accent" : "text-muted hover:text-fg",
              ].join(" ")}
            >
              <span aria-hidden className="block w-1.5 h-1.5 rounded-full bg-current" />
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
