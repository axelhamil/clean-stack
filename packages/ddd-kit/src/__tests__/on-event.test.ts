import { describe, expect, it, vi } from "vitest";
import { type IDomainEvent, isEventHandler, onEvent, Result } from "../index";

interface ClipRenderedPayload {
  clipId: string;
}

const eventOf = (payload: unknown): IDomainEvent => ({
  eventType: "clip.rendered",
  dateOccurred: new Date("2026-10-05T10:00:00Z"),
  aggregateId: "clip-1",
  payload,
});

const parseClipRendered = (payload: unknown): Result<ClipRenderedPayload> =>
  typeof payload === "object" && payload !== null && "clipId" in payload
    ? Result.ok({ clipId: String(payload.clipId) })
    : Result.fail("clipId is missing");

describe("onEvent", () => {
  it("builds a handler the discovery recognizes, and nothing else passes for one", () => {
    const handler = onEvent("clip.rendered", "publish-clip", () => async () => undefined)({});

    expect(isEventHandler(handler)).toBe(true);
    expect(isEventHandler({ eventType: "clip.rendered", handle: () => {} })).toBe(false);
    expect(isEventHandler(null)).toBe(false);
  });

  it("runs its body with the dependencies it was built with", async () => {
    const seen: string[] = [];
    const handler = onEvent(
      "clip.rendered",
      "publish-clip",
      (deps: { seen: string[] }) => async (event) => {
        deps.seen.push(event.aggregateId);
      },
    )({ seen });

    await handler.handle(eventOf({}));

    expect(seen).toEqual(["clip-1"]);
  });

  it("fails the delivery with the code and message of a failed result", async () => {
    const coded = onEvent(
      "clip.rendered",
      "publish-clip",
      () => async () => Result.fail({ code: "PUBLISH_UNAVAILABLE", message: "retry later" }),
    )({});
    const plain = onEvent(
      "clip.rendered",
      "notify-owner",
      () => async () => Result.fail("gone"),
    )({});
    const succeeded = onEvent("clip.rendered", "count-clip", () => async () => Result.ok())({});

    await expect(coded.handle(eventOf({}))).rejects.toThrow("PUBLISH_UNAVAILABLE: retry later");
    await expect(plain.handle(eventOf({}))).rejects.toThrow("gone");
    await expect(succeeded.handle(eventOf({}))).resolves.toBeUndefined();
  });

  it("hands the parsed payload to the body", async () => {
    const publish = vi.fn(async (_event: IDomainEvent, _payload: ClipRenderedPayload) => undefined);
    const handler = onEvent("clip.rendered", "publish-clip", () => publish, {
      payload: parseClipRendered,
    })({});
    const event = eventOf({ clipId: 42 });

    await handler.handle(event);

    expect(publish).toHaveBeenCalledWith(event, { clipId: "42" });
  });

  it("fails on a malformed payload without running the body", async () => {
    const publish = vi.fn(async (_event: IDomainEvent, _payload: ClipRenderedPayload) => undefined);
    const handler = onEvent("clip.rendered", "publish-clip", () => publish, {
      payload: parseClipRendered,
    })({});

    await expect(handler.handle(eventOf({ clip: 3 }))).rejects.toThrow(
      "clip.rendered has a malformed payload: clipId is missing",
    );
    expect(publish).not.toHaveBeenCalled();
  });
});
