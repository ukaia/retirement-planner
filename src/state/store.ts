import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SectionId } from "./sections";
import type { Plan } from "./schema";
import { defaultPlan } from "./defaults";

export type ThemeMode = "system" | "light" | "dark";
export type DisplayMode = "nominal" | "real";

type Store = {
  activeSection: SectionId;
  theme: ThemeMode;
  displayMode: DisplayMode;
  plan: Plan;
  setActiveSection: (id: SectionId) => void;
  setTheme: (theme: ThemeMode) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  updatePlan: (mutator: (draft: Plan) => void) => void;
  setPlan: (plan: Plan) => void;
  resetPlan: () => void;
};

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      activeSection: "profile",
      theme: "system",
      displayMode: "nominal",
      plan: defaultPlan(),
      setActiveSection: (id) => set({ activeSection: id }),
      setTheme: (theme) => set({ theme }),
      setDisplayMode: (mode) => set({ displayMode: mode }),
      updatePlan: (mutator) => {
        const next = structuredClone(get().plan);
        mutator(next);
        set({ plan: next });
      },
      setPlan: (plan) => set({ plan }),
      resetPlan: () => set({ plan: defaultPlan() }),
    }),
    {
      name: "rp-store",
      version: 1,
    },
  ),
);

// Compatibility re-export for the layout that imported useUIStore.
export const useUIStore = useStore;
