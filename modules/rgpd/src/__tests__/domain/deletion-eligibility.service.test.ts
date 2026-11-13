import { describe, expect, it } from "bun:test";
import { Option } from "@packages/ddd-kit";
import {
  isExportAllowed,
  wipeEligibility,
} from "../../domain/deletion/services/deletion-eligibility.service";
import { DeletionState } from "../../domain/deletion/value-objects/deletion-state.vo";

const NOW = new Date("2026-06-01T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;

describe("deletion eligibility", () => {
  it("treats an account wiped while still marked pending as wiped", () => {
    const state = DeletionState.of(Option.some(NOW), Option.some(NOW)).getValue();

    expect(wipeEligibility(state, NOW)).toBe("wiped");
  });

  it("makes the wipe due at the exact end of the grace period", () => {
    const state = DeletionState.of(Option.some(NOW), Option.none()).getValue();

    expect(wipeEligibility(state, NOW)).toBe("due");
  });

  it("refuses a deletion state whose date is not a real date", () => {
    const state = DeletionState.of(Option.some(new Date(Number.NaN)), Option.none());

    expect(state.isFailure).toBe(true);
    expect(state.getError().code).toBe("RGPD_DELETION_STATE_INVALID");
  });

  it("allows a new export at the exact end of the rate limit window, not a millisecond before", () => {
    const last = Option.some(new Date(NOW.getTime() - 24 * HOUR_MS));

    expect(isExportAllowed(last, NOW, 24)).toBe(true);
    expect(isExportAllowed(last, new Date(NOW.getTime() - 1), 24)).toBe(false);
  });
});
