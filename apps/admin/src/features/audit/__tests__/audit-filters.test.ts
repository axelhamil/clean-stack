import { describe, expect, it } from "vitest";
import { auditQueryOf } from "../audit-filters";

describe("auditQueryOf", () => {
  it("sends dates as the instants the API validates, covering the whole last day", () => {
    const query = auditQueryOf({ from: "2026-03-09", to: "2026-03-09" });

    expect(query.occurredFrom).toBe(new Date("2026-03-09T00:00:00").toISOString());
    expect(query.occurredTo).toBe(new Date("2026-03-09T23:59:59.999").toISOString());
  });

  it("omits blank filters", () => {
    expect(auditQueryOf({ actor: "  ", org: "" })).toEqual({});
  });
});
