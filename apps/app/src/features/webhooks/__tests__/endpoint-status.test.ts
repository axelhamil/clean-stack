import { describe, expect, it } from "vitest";
import { endpointStatus } from "../components/endpoint-row";

describe("endpointStatus", () => {
  it("returns active when enabled", () => {
    expect(endpointStatus({ enabled: true, disabledAt: null })).toBe("active");
  });

  it("returns paused when disabled without a disabledAt date", () => {
    expect(endpointStatus({ enabled: false, disabledAt: null })).toBe("paused");
  });

  it("returns auto-disabled when disabled with a disabledAt date", () => {
    expect(endpointStatus({ enabled: false, disabledAt: new Date().toISOString() })).toBe(
      "auto-disabled",
    );
  });
});
