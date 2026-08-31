import { enCatalog } from "@packages/i18n";
import { describe, expect, it } from "vitest";
import { INTERVAL_KEYS, isPlanInterval } from "../pricing-table";

function resolve(key: string): string | undefined {
  let cur: unknown = enCatalog.common;
  for (const seg of key.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "string" ? cur : undefined;
}

describe("INTERVAL_KEYS", () => {
  // `satisfies Record<PlanInterval, string>` only proves every interval has
  // AN entry — it does not prove each one points at the RIGHT one. A swapped
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
    expect(resolve(INTERVAL_KEYS.day)).toBe("day");
    expect(resolve(INTERVAL_KEYS.week)).toBe("week");
    expect(resolve(INTERVAL_KEYS.month)).toBe("month");
    expect(resolve(INTERVAL_KEYS.year)).toBe("year");
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
