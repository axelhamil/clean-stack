import { describe, expect, it } from "vitest";
import { enLabel } from "../../../shared/i18n/__tests__/catalog-t";
import { INTERVAL_KEYS, isPlanInterval } from "../pricing-table";

describe("INTERVAL_KEYS", () => {
  // `satisfies Record<PlanInterval, string>` only proves every interval has
  // AN entry: it does not prove each one points at the RIGHT one. A swapped
  // pair (e.g. `month` reading `pricing.interval.year`) still type-checks
  // and ships silently, so this asserts the mapping itself, one entry at a
  // time, not just its exhaustiveness.
  it("maps day to its own catalog key", () => {
    expect(INTERVAL_KEYS.day).toBe("pricing.interval.day");
  });

  it("maps week to its own catalog key", () => {
    expect(INTERVAL_KEYS.week).toBe("pricing.interval.week");
  });

  it("maps month to its own catalog key", () => {
    expect(INTERVAL_KEYS.month).toBe("pricing.interval.month");
  });

  it("maps year to its own catalog key", () => {
    expect(INTERVAL_KEYS.year).toBe("pricing.interval.year");
  });

  it("every key resolves to the matching English label", () => {
    expect(enLabel(INTERVAL_KEYS.day, "common")).toBe("day");
    expect(enLabel(INTERVAL_KEYS.week, "common")).toBe("week");
    expect(enLabel(INTERVAL_KEYS.month, "common")).toBe("month");
    expect(enLabel(INTERVAL_KEYS.year, "common")).toBe("year");
  });
});

describe("isPlanInterval", () => {
  it("accepts the four known intervals", () => {
    expect(isPlanInterval("day")).toBe(true);
    expect(isPlanInterval("week")).toBe(true);
    expect(isPlanInterval("month")).toBe(true);
    expect(isPlanInterval("year")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isPlanInterval("fortnight")).toBe(false);
    expect(isPlanInterval("")).toBe(false);
  });
});
