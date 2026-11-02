import { useSyncExternalStore } from "react";
import { THEME_COLORS } from "./theme-colors";
import { createThemeStore, type ResolvedTheme, type ThemeHost } from "./theme-store";

const STORAGE_KEY = "theme";
const SWITCHING_CLASS = "theme-switching";

const systemQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function applyResolved(resolved: ResolvedTheme) {
  const root = document.documentElement;

  root.classList.add(SWITCHING_CLASS);
  root.classList.toggle("dark", resolved === "dark");
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", THEME_COLORS[resolved]);
  }
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

  systemPrefersDark: () => systemQuery().matches,

  onSystemChange: (listener) => {
    const query = systemQuery();
    query.addEventListener("change", listener);

    return () => query.removeEventListener("change", listener);
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

let themeStore: ReturnType<typeof createThemeStore> | undefined;

export function useTheme() {
  themeStore ??= createThemeStore(browserHost);
  const state = useSyncExternalStore(themeStore.subscribe, themeStore.getState);

  return { ...state, setTheme: themeStore.setTheme };
}
