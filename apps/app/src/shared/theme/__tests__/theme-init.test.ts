import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const script = readFileSync(resolve(__dirname, "../../../../public/theme-init.js"), "utf8");

function runThemeInit(getItem: () => string | null, systemDark: boolean) {
  const toggle = vi.fn();

  runInNewContext(script, {
    window: {
      localStorage: { getItem },
      matchMedia: () => ({ matches: systemDark }),
    },
    document: { documentElement: { classList: { toggle } } },
  });

  return toggle;
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
});
