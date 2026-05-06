import { useEffect } from "react";
import { useUIStore } from "@/state/store";

export function useApplyTheme() {
  const theme = useUIStore((s) => s.theme);
  useEffect(() => {
    const apply = () => {
      const isDark =
        theme === "dark" ||
        (theme === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", isDark);
    };
    apply();
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);
}

export function ThemeToggle() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const next: Record<typeof theme, typeof theme> = {
    system: "light",
    light: "dark",
    dark: "system",
  };
  const label = theme === "system" ? "Auto" : theme === "light" ? "Light" : "Dark";
  return (
    <button
      type="button"
      className="btn-ghost text-xs px-2 py-1"
      aria-label={`Theme: ${label} (click to change)`}
      onClick={() => setTheme(next[theme])}
    >
      {label}
    </button>
  );
}
