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
});
