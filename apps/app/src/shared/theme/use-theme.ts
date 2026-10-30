import { useSyncExternalStore } from "react";
import { createThemeStore, type ResolvedTheme, type ThemeHost } from "./theme-store";

const STORAGE_KEY = "theme";
const SWITCHING_CLASS = "theme-switching";

const systemQuery = window.matchMedia("(prefers-color-scheme: dark)");

function applyResolved(resolved: ResolvedTheme) {
  const root = document.documentElement;

  root.classList.add(SWITCHING_CLASS);
  root.classList.toggle("dark", resolved === "dark");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove(SWITCHING_CLASS));
  });
}

const browserHost: ThemeHost = {
  readStored: () => {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },

  writeStored: (theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      return;
    }
  },

  systemPrefersDark: () => systemQuery.matches,

  onSystemChange: (listener) => {
    systemQuery.addEventListener("change", listener);

    return () => systemQuery.removeEventListener("change", listener);
  },

  onStoredChange: (listener) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) listener();
    };
    window.addEventListener("storage", onStorage);

    return () => window.removeEventListener("storage", onStorage);
  },

  applyResolved,
};

const themeStore = createThemeStore(browserHost);

export function useTheme() {
  const state = useSyncExternalStore(themeStore.subscribe, themeStore.getState);

  return { ...state, setTheme: themeStore.setTheme };
}
