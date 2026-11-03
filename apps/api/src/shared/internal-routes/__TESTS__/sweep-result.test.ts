import { describe, expect, it } from "bun:test";
import { classifySweepResult } from "../sweep-result";

describe("classifySweepResult", () => {
  it("classifies skipped, even alongside a batch-error and truncated", () => {
    const result = classifySweepResult({
      skipped: true,
      truncated: true,
      stopReasons: { pass1: "batch-error" },
    });
    expect(result).toEqual({ kind: "skipped" });
  });

  it("classifies a batch-error over truncated when both are present", () => {
    const result = classifySweepResult({
      truncated: true,
      stopReasons: { pass1: "batch-error", pass2: "budget" },
    });
    expect(result).toEqual({ kind: "batch-error", passes: ["pass1"] });
  });

  it("classifies truncated alone", () => {
    const result = classifySweepResult({ truncated: true, stopReasons: { pass1: "budget" } });
    expect(result).toEqual({ kind: "truncated" });
  });

  it("classifies all-exhausted stop reasons as ok", () => {
    const result = classifySweepResult({
      truncated: false,
      stopReasons: { pass1: "exhausted", pass2: "exhausted" },
    });
    expect(result).toEqual({ kind: "ok" });
  });

  it("classifies a response missing truncated/skipped/stopReasons as ok (sweep-audit-log shape)", () => {
    const result = classifySweepResult({});
    expect(result).toEqual({ kind: "ok" });
  });

  it("classifies an empty stopReasons object as ok", () => {
    const result = classifySweepResult({ truncated: false, skipped: false, stopReasons: {} });
    expect(result).toEqual({ kind: "ok" });
  });

  it("classifies a flush that found the lease held as skipped, a success", () => {
    const flush = { dryRun: false, skipped: true, flushed: 0, notifications: 0 };
    expect(classifySweepResult(flush)).toEqual({ kind: "skipped" });
  });

  it("classifies an rgpd sweep with a failed wipe as a batch error", () => {
    const rgpd = {
      processed: 2,
      succeeded: ["u1"],
      failed: [{ userId: "u2", errorCode: "WIPE_UNCAUGHT" }],
      dryRun: false,
      truncated: true,
    };
    expect(classifySweepResult(rgpd)).toEqual({ kind: "batch-error", passes: [] });
  });

  it("classifies an rgpd sweep with no failed wipe as ok", () => {
    const rgpd = { processed: 1, succeeded: ["u1"], failed: [], dryRun: false, truncated: false };
    expect(classifySweepResult(rgpd)).toEqual({ kind: "ok" });
  });
});
