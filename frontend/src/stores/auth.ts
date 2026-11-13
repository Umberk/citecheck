import { create } from "zustand";
import { api } from "../api";
import type { User } from "../api/types";
import { usePrefs } from "./prefs";

interface AuthState {
  status: "unknown" | "authed" | "guest";
  user: User | null;
  check: () => Promise<void>;
  setUser: (user: User) => void;
  logout: () => Promise<void>;
  expire: () => void;
}

export const useAuth = create<AuthState>()((set) => ({
  status: "unknown",
  user: null,
  check: async () => {
    try {
      const user = await api.auth.me();
      usePrefs.getState().setLocale(user.locale);
      set({ status: "authed", user });
    } catch {
      set({ status: "guest", user: null });
    }
  },
  setUser: (user) => {
    usePrefs.getState().setLocale(user.locale);
    set({ status: "authed", user });
  },
  logout: async () => {
    try {
      await api.auth.logout();
    } finally {
      set({ status: "guest", user: null });
    }
  },
  expire: () => set({ status: "guest", user: null }),
}));
