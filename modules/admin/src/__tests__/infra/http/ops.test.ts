import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import { ACTOR_ID, adminApp, send } from "../../fixtures/http-app";
import type { AdminRoutesDeps } from "../../fixtures/mount-admin-routes";

const AT = new Date("2026-01-02T03:04:05.000Z");

let ops = mockPort<AdminRoutesDeps["OpsService"]>();
let replays = mockPort<AdminRoutesDeps["StripeReplayService"]>();
let auth = mockPort<AdminRoutesDeps["IAuthProvider"]>();

beforeEach(() => {
  ops = mockPort<AdminRoutesDeps["OpsService"]>();
  replays = mockPort<AdminRoutesDeps["StripeReplayService"]>();
  auth = mockPort<AdminRoutesDeps["IAuthProvider"]>();
});

const app = () =>
  adminApp({
    OpsService: ops,
    StripeReplayService: replays,
    IAuthProvider: auth,
    isReplayableStripeEvent: (type) => type === "invoice.paid",
  });

describe("GET /admin/ops/dead-letters", () => {
  it("lists dead outbox events and the dead queue counts", async () => {
    ops.deadLetters.mockResolvedValue(
      Result.ok({
        outbox: {
          total: 1,
          items: [{ id: "e-1", eventType: "X", attempts: 5, deadAt: AT, lastError: Option.none() }],
        },
        queues: { emails: 2, webhooks: 3 },
      }),
    );

    const res = await send(app(), "GET", "/admin/ops/dead-letters");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      outbox: {
        total: 1,
        items: [
          { id: "e-1", eventType: "X", attempts: 5, deadAt: AT.toISOString(), lastError: null },
        ],
      },
      queues: { emails: 2, webhooks: 3 },
    });
  });
});

describe("POST /admin/ops/outbox/requeue", () => {
  it("requeues the given ids as the actor and returns the count", async () => {
    ops.requeue.mockResolvedValue(Result.ok({ requeued: 2 }));

    const res = await send(app(), "POST", "/admin/ops/outbox/requeue", { ids: ["e-1", "e-2"] });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ requeued: 2 });
    expect(ops.requeue).toHaveBeenCalledWith({ actorUserId: ACTOR_ID, ids: ["e-1", "e-2"] });
  });

  it("refuses an empty list", async () => {
    const res = await send(app(), "POST", "/admin/ops/outbox/requeue", { ids: [] });

    expect(res.status).toBe(400);
    expect(ops.requeue).not.toHaveBeenCalled();
  });
});

describe("GET /admin/ops/sweeps", () => {
  it("lists the last run of each sweep with its lateness", async () => {
    ops.sweeps.mockResolvedValue(
      Result.ok([
        {
          label: "sweep-x",
          outcome: "ok",
          count: 4,
          late: true,
          startedAt: AT,
          finishedAt: AT,
          durationMs: 1,
        },
      ]),
    );

    const res = await send(app(), "GET", "/admin/ops/sweeps");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [
        { label: "sweep-x", outcome: "ok", count: 4, late: true, finishedAt: AT.toISOString() },
      ],
    });
  });
});

describe("GET /admin/ops/stripe-events", () => {
  it("marks each event replayable or not by its type", async () => {
    replays.list.mockResolvedValue(
      Result.ok({
        configured: true,
        items: [
          {
            id: "evt_1",
            type: "invoice.paid",
            receivedAt: AT,
            status: "failed",
            lastError: Option.some("boom"),
            replayedAt: Option.none(),
          },
          {
            id: "evt_2",
            type: "customer.created",
            receivedAt: AT,
            status: "received",
            lastError: Option.none(),
            replayedAt: Option.some(AT),
          },
        ],
      }),
    );

    const res = await send(app(), "GET", "/admin/ops/stripe-events");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      configured: true,
      items: [
        {
          id: "evt_1",
          type: "invoice.paid",
          status: "failed",
          receivedAt: AT.toISOString(),
          lastError: "boom",
          replayedAt: null,
          replayable: true,
        },
        {
          id: "evt_2",
          type: "customer.created",
          status: "received",
          receivedAt: AT.toISOString(),
          lastError: null,
          replayedAt: AT.toISOString(),
          replayable: false,
        },
      ],
    });
  });
});

describe("POST /admin/ops/stripe-events/:id/replay", () => {
  it("replays the event as the actor through the auth webhook handler", async () => {
    const delivered = new Response(null, { status: 200 });
    auth.handle.mockResolvedValue(delivered);
    replays.replay.mockImplementation(async ({ handler }) => {
      const answered = await handler(new Request("https://example.test/webhook"));

      return answered === delivered
        ? Result.ok()
        : Result.fail({
            code: "STRIPE_PROVIDER_FAILURE",
            message: "not relayed",
          });
    });

    const res = await send(app(), "POST", "/admin/ops/stripe-events/evt_1/replay");

    expect(res.status).toBe(200);
    expect(replays.replay).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: ACTOR_ID, stripeEventId: "evt_1" }),
    );
    expect(auth.handle).toHaveBeenCalledTimes(1);
  });
});
