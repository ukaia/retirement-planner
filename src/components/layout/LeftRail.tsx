import { SECTIONS } from "@/state/sections";
import { useUIStore } from "@/state/store";
import { ThemeToggle } from "./ThemeToggle";

export function LeftRail() {
  const active = useUIStore((s) => s.activeSection);
  const setActive = useUIStore((s) => s.setActiveSection);
  return (
    <aside className="no-print hidden md:flex md:flex-col md:w-56 lg:w-60 shrink-0 border-r border-border bg-surface">
      <div className="px-5 py-5 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold tracking-tight">Retirement</div>
          <div className="text-xs text-muted">Planner</div>
        </div>
        <ThemeToggle />
      </div>
      <div className="divider mx-5" />
      <nav className="px-2 py-3 flex-1 overflow-y-auto">
        {SECTIONS.map((s) => {
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={[
                "w-full text-left rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-surface-2 text-fg font-medium"
                  : "text-muted hover:text-fg hover:bg-surface-2",
              ].join(" ")}
            >
              {s.label}
            </button>
          );
        })}
      </nav>
      <div className="px-5 py-3 text-[10px] text-subtle">
        Local-only · v0.1
      </div>
    </aside>
  );
}
