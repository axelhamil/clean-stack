export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface ThemeState {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
}

export interface ThemeHost {
  readStored: () => string | null;
  writeStored: (theme: ThemePreference) => void;
  systemPrefersDark: () => boolean;
  onSystemChange: (listener: () => void) => () => void;
  onStoredChange: (listener: () => void) => () => void;
  applyResolved: (resolved: ResolvedTheme) => void;
}

function parsePreference(stored: string | null): ThemePreference {
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function createThemeStore(host: ThemeHost) {
  let preference = parsePreference(host.readStored());
  const listeners = new Set<() => void>();
  let detach: (() => void) | undefined;

  const resolve = (): ResolvedTheme => {
    if (preference !== "system") return preference;

    return host.systemPrefersDark() ? "dark" : "light";
  };

  let state: ThemeState = { theme: preference, resolvedTheme: resolve() };

  const refresh = () => {
    const resolvedTheme = resolve();
    if (state.theme === preference && state.resolvedTheme === resolvedTheme) return;

    if (state.resolvedTheme !== resolvedTheme) host.applyResolved(resolvedTheme);
    state = { theme: preference, resolvedTheme };
    for (const listener of listeners) listener();
  };

  const attach = () => {
    const detachSystem = host.onSystemChange(refresh);
    const detachStored = host.onStoredChange(() => {
      preference = parsePreference(host.readStored());
      refresh();
    });

    return () => {
      detachSystem();
      detachStored();
    };
  };

  return {
    getState: () => state,

    setTheme: (theme: ThemePreference) => {
      preference = theme;
      host.writeStored(theme);
      refresh();
    },

    subscribe: (listener: () => void) => {
      if (listeners.size === 0) detach = attach();
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) detach?.();
      };
    },
  };
}
