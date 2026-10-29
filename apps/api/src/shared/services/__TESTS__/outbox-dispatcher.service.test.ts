import { describe, expect, test } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "../../../__TESTS__/mock-instrumentation";
import type { IOutboxRepository } from "../../ports/outbox.port";
import { OutboxDispatcher } from "../outbox-dispatcher.service";
import { FakePgListenClient } from "./fake-pg-listen-client";

function makeDispatcher() {
  const errors: string[] = [];
  const logger = {
    info() {},
    warn() {},
    debug() {},
    error: (_obj: unknown, msg: string) => errors.push(msg),
  };
  const outbox = mockPort<IOutboxRepository>();
  outbox.claim.mockResolvedValue(Result.fail("outbox_unavailable: connection refused"));
  const client = new FakePgListenClient();
  const dispatcher = new OutboxDispatcher(
    outbox,
    [],
    logger as never,
    "postgres://unused",
    mockInstrumentation(),
    { createClient: () => client },
  );
  return { dispatcher, client, errors, outbox };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("OutboxDispatcher", () => {
  test("a first drain that fails is logged instead of crashing the process", async () => {
    const { dispatcher, errors } = makeDispatcher();

    await dispatcher.start();
    await wait(10);

    expect(errors).toContain("outbox drain failed (start)");

    await dispatcher.stop();
  });

  test("a NOTIFY on the listen connection triggers a drain", async () => {
    const { dispatcher, client, errors, outbox } = makeDispatcher();
    await dispatcher.start();
    await wait(10);
    const before = outbox.claim.mock.calls.length;

    client.deliver("event-1");
    await wait(10);

    expect(outbox.claim.mock.calls.length).toBe(before + 1);
    expect(errors).toContain("outbox drain failed (notify)");

    await dispatcher.stop();
  });
});
