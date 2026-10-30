import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { THEME_COLORS } from "../theme-colors";

const script = readFileSync(resolve(__dirname, "../../../../public/theme-init.js"), "utf8");

function runThemeInit(getItem: () => string | null, systemDark: boolean) {
  const toggle = vi.fn();
  const setAttribute = vi.fn();
  const querySelectorAll = () => [{ setAttribute }, { setAttribute }];

  runInNewContext(script, {
    window: {
      localStorage: { getItem },
      matchMedia: () => ({ matches: systemDark }),
    },
    document: { documentElement: { classList: { toggle } }, querySelectorAll },
  });

  return Object.assign(toggle, { setAttribute });
}

describe("theme-init script", () => {
  it("lets the stored choice win over the system preference", () => {
    const toggle = runThemeInit(() => "light", true);

    expect(toggle).toHaveBeenCalledWith("dark", false);
  });

  it("follows the system preference when nothing is stored or storage throws", () => {
    const unset = runThemeInit(() => null, true);
    const blocked = runThemeInit(() => {
      throw new Error("denied");
    }, true);

    expect(unset).toHaveBeenCalledWith("dark", true);
    expect(blocked).toHaveBeenCalledWith("dark", true);
  });

  it("paints the browser chrome with the chosen theme on both color metas", () => {
    const { setAttribute } = runThemeInit(() => "dark", false);

    expect(setAttribute).toHaveBeenCalledTimes(2);
    expect(setAttribute).toHaveBeenCalledWith("content", THEME_COLORS.dark);
  });
});
