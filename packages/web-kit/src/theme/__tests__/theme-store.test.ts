import { describe, expect, it, vi } from "vitest";
import { createThemeStore, type ThemeHost } from "../theme-store";

function givenHost(stored: string | null, systemDark: boolean) {
  const systemListeners: Array<() => void> = [];
  const state = { systemDark };

  const host: ThemeHost = {
    readStored: () => stored,
    writeStored: vi.fn(),
    systemPrefersDark: () => state.systemDark,
    onSystemChange: (listener) => {
      systemListeners.push(listener);
      return vi.fn();
    },
    onStoredChange: () => vi.fn(),
    applyResolved: vi.fn(),
  };

  const changeSystem = (dark: boolean) => {
    state.systemDark = dark;
    for (const listener of systemListeners) listener();
  };

  return { host, changeSystem };
}

describe("theme store", () => {
  it("keeps the stored choice when the system preference changes", () => {
    const { host, changeSystem } = givenHost("light", true);
    const store = createThemeStore(host);
    store.subscribe(vi.fn());

    changeSystem(false);
    changeSystem(true);

    expect(store.getState()).toEqual({ theme: "light", resolvedTheme: "light" });
    expect(host.applyResolved).not.toHaveBeenCalled();
  });

  it("follows the system preference when nothing is stored", () => {
    const { host, changeSystem } = givenHost(null, false);
    const store = createThemeStore(host);
    store.subscribe(vi.fn());

    changeSystem(true);

    expect(store.getState()).toEqual({ theme: "system", resolvedTheme: "dark" });
    expect(host.applyResolved).toHaveBeenCalledWith("dark");
  });
});
