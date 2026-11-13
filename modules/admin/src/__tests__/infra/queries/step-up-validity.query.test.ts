import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type { IStepUpStore } from "../../../application/ports/repositories/step-up-store.port";
import { StepUpValidityQuery } from "../../../infra/queries/step-up-validity.query";

const TTL_SECONDS = 300;
const NOW = new Date("2026-10-30T12:00:00Z");

function queryFor(verifiedAt: Date) {
  const store = mockPort<IStepUpStore>();
  store.findVerifiedAt.mockImplementation(async () => Result.ok(Option.some(verifiedAt)));

  return new StepUpValidityQuery(
    store,
    { ADMIN_STEP_UP_TTL_SECONDS: TTL_SECONDS },
    mockInstrumentation(),
  );
}

afterEach(() => {
  setSystemTime();
});

describe("StepUpValidityQuery", () => {
  it("answers the expiry while the window is open", async () => {
    setSystemTime(NOW);
    const verifiedAt = new Date(NOW.getTime() - (TTL_SECONDS - 1) * 1000);

    const result = await queryFor(verifiedAt).execute({ sessionId: "s1" });

    expect(result.getValue().unwrap()).toEqual(new Date(NOW.getTime() + 1000));
  });

  it("answers nothing once the window has closed", async () => {
    setSystemTime(NOW);
    const verifiedAt = new Date(NOW.getTime() - TTL_SECONDS * 1000);

    const result = await queryFor(verifiedAt).execute({ sessionId: "s1" });

    expect(result.getValue().isNone()).toBe(true);
  });
});
