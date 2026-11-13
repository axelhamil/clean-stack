import { describe, expect, it, vi } from "vitest";
import { dispatchTo, type IDomainEvent, type IUseCase, onEvent, Result } from "../index";

interface ClipRenderedPayload {
  clipId: string;
}

interface PublishClipInput {
  clipId: string;
  eventId: string;
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

const publishClipHandler = (useCase: IUseCase<PublishClipInput, string, string>) =>
  onEvent(
    "clip.rendered",
    "publish-clip",
    (deps: { publishClip: IUseCase<PublishClipInput, string, string> }) =>
      dispatchTo(deps.publishClip, (payload: ClipRenderedPayload, event) => ({
        clipId: payload.clipId,
        eventId: event.aggregateId,
      })),
    { payload: parseClipRendered },
  )({ publishClip: useCase });

describe("dispatchTo", () => {
  it("runs the use case with the input mapped from the parsed payload", async () => {
    const execute = vi.fn(async (_input: PublishClipInput) =>
      Result.ok<string, string>("published"),
    );

    await publishClipHandler({ execute }).handle(eventOf({ clipId: 42 }));

    expect(execute).toHaveBeenCalledWith({ clipId: "42", eventId: "clip-1" });
  });

  it("fails the delivery with the error of a failed use case", async () => {
    const execute = vi.fn(async (_input: PublishClipInput) =>
      Result.fail<string, string>("CLIP_NOT_FOUND"),
    );

    await expect(publishClipHandler({ execute }).handle(eventOf({ clipId: 42 }))).rejects.toThrow(
      "CLIP_NOT_FOUND",
    );
  });

  it("fails on a malformed payload without running the use case", async () => {
    const execute = vi.fn(async (_input: PublishClipInput) =>
      Result.ok<string, string>("published"),
    );

    await expect(publishClipHandler({ execute }).handle(eventOf({ clip: 3 }))).rejects.toThrow(
      "clip.rendered has a malformed payload: clipId is missing",
    );
    expect(execute).not.toHaveBeenCalled();
  });
});
