import { beforeEach, describe, expect, it } from "bun:test";
import {
  type IInstrumentation,
  type ILogger,
  type IUseCase,
  Option,
  Result,
} from "@packages/ddd-kit";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type {
  IWebhookDeliveryRepository,
  WebhookDeliveryRecord,
} from "../../../application/ports/repositories/webhook-delivery.port";
import type { WebhookRepoError } from "../../../application/ports/repositories/webhook-endpoint.port";
import {
  type DeliveryOutcome,
  failedOutcome,
} from "../../../application/services/delivery-policy.service";
import type { DeliverWebhookInput } from "../../../application/usecases/deliver-webhook/deliver-webhook.dto";
import type {
  SettleDeliveryInput,
  SettleDeliveryOutput,
} from "../../../application/usecases/settle-delivery/settle-delivery.dto";
import { WebhookDeliveryWorker } from "../../../infra/adapters/webhook-delivery-worker.adapter";
import { webhookDelivery } from "./fixtures";

const SUCCESS: DeliveryOutcome = {
  verdict: { kind: "success" },
  responseStatus: Option.some(200),
  organizationId: Option.some("org-1"),
  attempt: Option.none(),
};

let deliveries: PortMock<IWebhookDeliveryRepository>;
let deliver: PortMock<IUseCase<DeliverWebhookInput, DeliveryOutcome, never>>;
let settle: PortMock<IUseCase<SettleDeliveryInput, SettleDeliveryOutput, WebhookRepoError>>;
let logger: PortMock<ILogger>;
let instrumentation: PortMock<IInstrumentation>;
let drains: Promise<unknown>[];
let now: number;

function worker(leaseSeconds = 330) {
  return new WebhookDeliveryWorker(
    deliveries,
    deliver,
    settle,
    logger,
    instrumentation,
    { leaseSeconds },
    () => now,
  );
}

async function drainOnce(subject: WebhookDeliveryWorker): Promise<void> {
  await subject.start();
  await Promise.allSettled(drains);
  await subject.stop();
}

function claims(batch: WebhookDeliveryRecord[]) {
  deliveries.claim.mockResolvedValueOnce(Result.ok(batch));
}

const settledIds = () => settle.execute.mock.calls.map(([{ delivery }]) => delivery.id);
const releasedIds = () => deliveries.release.mock.calls.map(([lease]) => lease.id);
const messages = (calls: unknown[][]) => calls.map(([, message]) => message);

describe("WebhookDeliveryWorker", () => {
  beforeEach(() => {
    deliveries = mockPort<IWebhookDeliveryRepository>();
    deliver = mockPort<IUseCase<DeliverWebhookInput, DeliveryOutcome, never>>();
    settle = mockPort<IUseCase<SettleDeliveryInput, SettleDeliveryOutput, WebhookRepoError>>();
    logger = mockPort<ILogger>();
    instrumentation = mockInstrumentation();
    drains = [];
    now = 0;
    instrumentation.startSpan.mockImplementation((options, work) => {
      const ran = work();
      if (options.name === "WebhookDeliveryWorker > drain") drains.push(Promise.resolve(ran));
      return ran;
    });
    deliveries.claim.mockResolvedValue(Result.ok([]));
    deliveries.release.mockResolvedValue(Result.ok(true));
    deliver.execute.mockResolvedValue(Result.ok(SUCCESS));
    settle.execute.mockResolvedValue(Result.ok({ written: true }));
  });

  it.each([
    [330, 8],
    [120, 2],
  ])(
    "claims no more deliveries than a %i s lease covers with its settle margin",
    async (leaseSeconds, limit) => {
      await drainOnce(worker(leaseSeconds));

      expect(deliveries.claim.mock.calls.map(([request]) => request)).toEqual([
        { limit, leaseSeconds },
      ]);
    },
  );

  it("settles each delivery with its outcome and turns a thrown delivery into a retryable failure", async () => {
    claims([webhookDelivery({ id: "del-1" }), webhookDelivery({ id: "del-2" })]);
    deliver.execute.mockImplementation(async ({ delivery }) => {
      if (delivery.id === "del-1") throw new Error("boom");
      return Result.ok(SUCCESS);
    });

    await drainOnce(worker());

    expect(
      settle.execute.mock.calls.map(([{ delivery, outcome }]) => [delivery.id, outcome]),
    ).toEqual([
      ["del-1", failedOutcome("Error: boom")],
      ["del-2", SUCCESS],
    ]);
    expect(instrumentation.capture).toHaveBeenCalled();
  });

  it("releases the deliveries the remaining lease no longer covers", async () => {
    claims([webhookDelivery({ id: "del-1" }), webhookDelivery({ id: "del-2" })]);
    deliver.execute.mockImplementation(async () => {
      now += 300_000;
      return Result.ok(SUCCESS);
    });

    await drainOnce(worker());

    expect(settledIds()).toEqual(["del-1"]);
    expect(releasedIds()).toEqual(["del-2"]);
  });

  it("releases the unstarted deliveries when stopped mid batch", async () => {
    claims([
      webhookDelivery({ id: "del-1" }),
      webhookDelivery({ id: "del-2" }),
      webhookDelivery({ id: "del-3" }),
    ]);
    const { promise: answered, resolve: answer } = Promise.withResolvers<void>();
    const { promise: started, resolve: start } = Promise.withResolvers<void>();
    deliver.execute.mockImplementation(async () => {
      start();
      await answered;
      return Result.ok(SUCCESS);
    });
    const subject = worker();

    await subject.start();
    await started;
    const stopping = subject.stop();
    answer();
    await Promise.all([stopping, ...drains]);

    expect(settledIds()).toEqual(["del-1"]);
    expect(releasedIds()).toEqual(["del-2", "del-3"]);
  });

  it("warns when the settle wrote nothing because the lease was lost", async () => {
    claims([webhookDelivery()]);
    settle.execute.mockResolvedValue(Result.ok({ written: false }));

    await drainOnce(worker());

    expect(messages(logger.warn.mock.calls)).toEqual([
      "webhook delivery settle skipped a delivery whose lease was lost",
    ]);
  });

  it("reports a failing drain instead of leaving an unhandled rejection", async () => {
    deliveries.claim.mockRejectedValue(new Error("connection refused"));

    await drainOnce(worker());

    expect(instrumentation.capture).toHaveBeenCalled();
    expect(messages(logger.error.mock.calls)).toContain("webhook delivery drain failed");
  });
});
