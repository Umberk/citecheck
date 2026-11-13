import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale, SystemName } from "../api/types";

interface PrefsState {
  locale: Locale;
  defaultSystem: SystemName;
  sidebarCollapsed: boolean;
  libraryView: "grid" | "list";
  setLocale: (locale: Locale) => void;
  setDefaultSystem: (system: SystemName) => void;
  toggleSidebar: () => void;
  setLibraryView: (view: "grid" | "list") => void;
}

const browserLocale: Locale =
  typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      locale: browserLocale,
      defaultSystem: "full",
      sidebarCollapsed: false,
      libraryView: "grid",
      setLocale: (locale) => set({ locale }),
      setDefaultSystem: (defaultSystem) => set({ defaultSystem }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setLibraryView: (libraryView) => set({ libraryView }),
    }),
    { name: "citecheck-prefs" },
  ),
);
