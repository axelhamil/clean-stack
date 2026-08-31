import { describe, expect, it } from "bun:test";
import { NoOpInstrumentation } from "../../services/noop-instrumentation";
import { buildEmailSweepPasses } from "../sweep-email-messages.route";
import { sweepSpans } from "../sweep-span";

describe("buildEmailSweepPasses", () => {
  it("declares a sent pass and a failed pass on separate retention knobs", () => {
    const passes = buildEmailSweepPasses(sweepSpans(new NoOpInstrumentation()));

    expect(passes.map((p) => p.label)).toEqual(["sent", "failed"]);
    const sent = passes.find((p) => p.label === "sent");
    const failed = passes.find((p) => p.label === "failed");
    expect(sent?.retentionDays).toBe(7);
    expect(failed?.retentionDays).toBe(90);
    // The assertion that matters: the failed pass must NOT reuse the sent knob.
    expect(failed?.retentionDays).not.toBe(sent?.retentionDays);
  });
});
