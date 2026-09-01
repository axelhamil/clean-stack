import { enCatalog } from "@packages/i18n";
import { describe, expect, it } from "vitest";
import { FORCED_NOTE_KEYS, FREQUENCY_KEYS } from "../preference-matrix";

function resolve(key: string): string | undefined {
  let cur: unknown = enCatalog.settings;
  for (const seg of key.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "string" ? cur : undefined;
}

describe("FREQUENCY_KEYS", () => {
  // `satisfies Record<NotificationFrequency, string>` only proves every
  // frequency has AN entry — it does not prove each entry points at the RIGHT
  // one. A swapped pair (e.g. `hourly` reading `frequency.daily`) still
  // type-checks, so this asserts the mapping itself.
  it("maps each frequency to its own catalog key, never a swapped one", () => {
    expect(FREQUENCY_KEYS).toStrictEqual({
      immediate: "notifications.frequency.immediate",
      hourly: "notifications.frequency.hourly",
      daily: "notifications.frequency.daily",
    });
  });

  it("every key resolves to the matching English label", () => {
    expect(resolve(FREQUENCY_KEYS.immediate)).toBe("Immediately");
    expect(resolve(FREQUENCY_KEYS.hourly)).toBe("Hourly digest");
    expect(resolve(FREQUENCY_KEYS.daily)).toBe("Daily digest");
  });
});

describe("FORCED_NOTE_KEYS", () => {
  it("maps each forced level to its own catalog key, never a swapped one", () => {
    expect(FORCED_NOTE_KEYS).toStrictEqual({
      all: "notifications.forcedAll",
      some: "notifications.forcedSome",
      none: null,
    });
  });

  it("every non-null key resolves to the matching English note", () => {
    expect(resolve(FORCED_NOTE_KEYS.all)).toBe(
      "Always sent. Critical account alerts cannot be turned off.",
    );
    expect(resolve(FORCED_NOTE_KEYS.some)).toBe(
      "Some critical alerts in this category are always sent.",
    );
    expect(FORCED_NOTE_KEYS.none).toBeNull();
  });
});
