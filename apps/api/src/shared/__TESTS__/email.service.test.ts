import { describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import type { EmailMessageInsert, IEmailQueue } from "../ports/email-queue.port";
import { QueuedEmailService } from "../services/email.service";
import { NoOpInstrumentation } from "../services/noop-instrumentation";

function fakeQueue(enqueue?: IEmailQueue["enqueue"]) {
  const rows: EmailMessageInsert[] = [];
  const queue = mockPort<IEmailQueue>();
  queue.enqueue.mockImplementation(
    enqueue ??
      (async (batch) => {
        rows.push(...batch);
        return Result.ok({ written: batch.length });
      }),
  );
  return { port: queue, rows };
}

describe("QueuedEmailService", () => {
  it("enqueues one template row instead of calling the provider", async () => {
    const queue = fakeQueue();
    const service = new QueuedEmailService(queue.port, new NoOpInstrumentation());
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
    const service = new QueuedEmailService(queue.port, new NoOpInstrumentation());
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
    const service = new QueuedEmailService(queue.port, new NoOpInstrumentation());
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
    const service = new QueuedEmailService(queue.port, new NoOpInstrumentation());
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
    const failing = fakeQueue(async () =>
      Result.fail({ code: "EMAIL_QUEUE_WRITE_FAILED", message: "db down" }),
    );
    const service = new QueuedEmailService(failing.port, new NoOpInstrumentation());
    const result = await service.sendTemplate("magic_link", "a@x.test", {
      magicUrl: "https://x.test/m",
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("EMAIL_PROVIDER_FAILURE");
  });

  it("fails with EMAIL_PROVIDER_FAILURE when every row is suppressed (0 of N written)", async () => {
    const fullySuppressed = fakeQueue(async () => Result.ok({ written: 0 }));
    const service = new QueuedEmailService(fullySuppressed.port, new NoOpInstrumentation());
    const result = await service.sendTemplate("delete_completed", "a@x.test", { name: "Ada" });
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("EMAIL_PROVIDER_FAILURE");
  });

  it("stays success on a partial suppression (some rows written, some duplicates)", async () => {
    const partiallySuppressed = fakeQueue(async () => Result.ok({ written: 1 }));
    const service = new QueuedEmailService(partiallySuppressed.port, new NoOpInstrumentation());
    const result = await service.sendTemplateBatch("delete_completed", [
      { to: "a@x.test", variables: { name: "Ada" } },
      { to: "b@x.test", variables: { name: "Bob" } },
    ]);
    expect(result.isSuccess).toBe(true);
  });

  it("uses a recipient-level key verbatim", async () => {
    const queue = fakeQueue();
    const service = new QueuedEmailService(queue.port, new NoOpInstrumentation());
    await service.sendTemplateBatch("delete_completed", [
      { to: "a@example.com", variables: { name: "A" }, idempotencyKey: "wipe/user-1" },
    ]);
    expect(queue.rows[0]?.idempotencyKey.unwrap()).toBe("wipe/user-1");
  });

  it("falls back to the batch key namespaced with #", async () => {
    const queue = fakeQueue();
    const service = new QueuedEmailService(queue.port, new NoOpInstrumentation());
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
    const service = new QueuedEmailService(queue.port, new NoOpInstrumentation());
    await service.sendTemplateBatch(
      "delete_completed",
      [{ to: "a@example.com", variables: { name: "A" }, idempotencyKey: "explicit" }],
      { idempotencyKey: "batch" },
    );
    expect(queue.rows[0]?.idempotencyKey.unwrap()).toBe("explicit");
  });

  it("leaves the key absent when neither form is supplied", async () => {
    const queue = fakeQueue();
    const service = new QueuedEmailService(queue.port, new NoOpInstrumentation());
    await service.sendTemplateBatch("delete_completed", [
      { to: "a@example.com", variables: { name: "A" } },
    ]);
    expect(queue.rows[0]?.idempotencyKey.isNone()).toBe(true);
  });

  it("namespaces the raw batch fallback with # like the template batch", async () => {
    const queue = fakeQueue();
    const service = new QueuedEmailService(queue.port, new NoOpInstrumentation());
    await service.sendRawBatch(
      [
        { to: "a@example.com", subject: "S1", body: { text: "1" } },
        { to: "b@example.com", subject: "S2", body: { text: "2" } },
      ],
      { idempotencyKey: "key" },
    );
    const rows = queue.rows;
    expect(rows[0]?.idempotencyKey.unwrap()).toBe("key#0");
    expect(rows[1]?.idempotencyKey.unwrap()).toBe("key#1");
  });
});
