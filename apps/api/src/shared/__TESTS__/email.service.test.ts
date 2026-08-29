import { describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import type { EmailMessageInsert } from "../ports/email-queue.port";
import { QueuedEmailService } from "../services/email.service";
import { NoOpInstrumentation } from "../services/noop-instrumentation";

function fakeQueue() {
  const rows: EmailMessageInsert[] = [];
  return {
    rows,
    enqueue: async (batch: EmailMessageInsert[]) => {
      rows.push(...batch);
      return Result.ok<void, never>(undefined);
    },
    claimPending: async () => Result.ok([]),
    markSent: async () => Result.ok<void, never>(undefined),
    markFailed: async () => Result.ok<void, never>(undefined),
  };
}

describe("QueuedEmailService", () => {
  it("enqueues one template row instead of calling the provider", async () => {
    const queue = fakeQueue();
    const service = new QueuedEmailService(queue as never, new NoOpInstrumentation());
    const result = await service.sendTemplate("verify_email", "a@x.test", {
      name: "Ada",
      verifyUrl: "https://x.test/v",
    });
    expect(result.isSuccess).toBe(true);
    expect(queue.rows).toHaveLength(1);
    expect(queue.rows[0]?.kind).toBe("template");
    expect(queue.rows[0]?.template).toEqual(Option.some("verify_email"));
    expect(queue.rows[0]?.subject.length).toBeGreaterThan(0);
  });

  it("enqueues a raw row with the caller's subject and body", async () => {
    const queue = fakeQueue();
    const service = new QueuedEmailService(queue as never, new NoOpInstrumentation());
    const result = await service.sendRaw("a@x.test", "Deploy done", {
      html: "<p>ok</p>",
      text: "ok",
    });
    expect(result.isSuccess).toBe(true);
    expect(queue.rows[0]?.kind).toBe("raw");
    expect(queue.rows[0]?.template.isNone()).toBe(true);
    expect(queue.rows[0]?.subject).toBe("Deploy done");
  });

  it("enqueues one row per recipient for a template batch", async () => {
    const queue = fakeQueue();
    const service = new QueuedEmailService(queue as never, new NoOpInstrumentation());
    const result = await service.sendTemplateBatch("delete_completed", [
      { to: "a@x.test", variables: { name: "Ada" } },
      { to: "b@x.test", variables: { name: "Bob" } },
    ]);
    expect(result.isSuccess).toBe(true);
    expect(queue.rows).toHaveLength(2);
    expect(queue.rows.map((r) => r.toAddress)).toEqual(["a@x.test", "b@x.test"]);
  });

  it("freezes the caller's locale on the row and renders the subject in it", async () => {
    const queue = fakeQueue();
    const service = new QueuedEmailService(queue as never, new NoOpInstrumentation());
    const result = await service.sendTemplate(
      "verify_email",
      "a@x.test",
      { name: "Ada", verifyUrl: "https://x.test/v" },
      { locale: "fr" },
    );
    expect(result.isSuccess).toBe(true);
    expect(queue.rows[0]?.locale).toBe("fr");
    expect(queue.rows[0]?.subject).toBe("Confirmez votre adresse e-mail");
  });

  it("surfaces a queue write failure as EMAIL_PROVIDER_FAILURE", async () => {
    const failing = {
      enqueue: async () => Result.fail({ code: "EMAIL_QUEUE_WRITE_FAILED", message: "db down" }),
    };
    const service = new QueuedEmailService(failing as never, new NoOpInstrumentation());
    const result = await service.sendTemplate("magic_link", "a@x.test", {
      magicUrl: "https://x.test/m",
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("EMAIL_PROVIDER_FAILURE");
  });

  it("uses a recipient-level key verbatim", async () => {
    const queue = fakeQueue();
    const service = new QueuedEmailService(queue as never, new NoOpInstrumentation());
    await service.sendTemplateBatch("delete_completed", [
      { to: "a@example.com", variables: { name: "A" }, idempotencyKey: "wipe/user-1" },
    ]);
    expect(queue.rows[0]?.idempotencyKey.unwrap()).toBe("wipe/user-1");
  });

  it("falls back to the batch key namespaced with #", async () => {
    const queue = fakeQueue();
    const service = new QueuedEmailService(queue as never, new NoOpInstrumentation());
    await service.sendTemplateBatch(
      "delete_completed",
      [
        { to: "a@example.com", variables: { name: "A" } },
        { to: "b@example.com", variables: { name: "B" } },
      ],
      { idempotencyKey: "batch" },
    );
    const rows = queue.rows;
    expect(rows[0]?.idempotencyKey.unwrap()).toBe("batch#0");
    expect(rows[1]?.idempotencyKey.unwrap()).toBe("batch#1");
  });

  it("prefers the recipient key over the batch key", async () => {
    const queue = fakeQueue();
    const service = new QueuedEmailService(queue as never, new NoOpInstrumentation());
    await service.sendTemplateBatch(
      "delete_completed",
      [{ to: "a@example.com", variables: { name: "A" }, idempotencyKey: "explicit" }],
      { idempotencyKey: "batch" },
    );
    expect(queue.rows[0]?.idempotencyKey.unwrap()).toBe("explicit");
  });

  it("leaves the key absent when neither form is supplied", async () => {
    const queue = fakeQueue();
    const service = new QueuedEmailService(queue as never, new NoOpInstrumentation());
    await service.sendTemplateBatch("delete_completed", [
      { to: "a@example.com", variables: { name: "A" } },
    ]);
    expect(queue.rows[0]?.idempotencyKey.isNone()).toBe(true);
  });
});
