import { describe, expect, it } from "vitest";
import { enLabel } from "../../../shared/i18n/__tests__/catalog-t";
import { FORCED_NOTE_KEYS, FREQUENCY_KEYS } from "../preference-matrix";

describe("FREQUENCY_KEYS", () => {
  // `satisfies Record<NotificationFrequency, string>` only proves every
  // frequency has AN entry: it does not prove each entry points at the RIGHT
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
    expect(enLabel(FREQUENCY_KEYS.immediate, "settings")).toBe("Immediately");
    expect(enLabel(FREQUENCY_KEYS.hourly, "settings")).toBe("Hourly digest");
    expect(enLabel(FREQUENCY_KEYS.daily, "settings")).toBe("Daily digest");
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
    expect(enLabel(FORCED_NOTE_KEYS.all, "settings")).toBe(
      "Always sent. Critical account alerts cannot be turned off.",
    );
    expect(enLabel(FORCED_NOTE_KEYS.some, "settings")).toBe(
      "Some critical alerts in this category are always sent.",
    );
    expect(FORCED_NOTE_KEYS.none).toBeNull();
  });
});
