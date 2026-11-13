import { describe, expect, it } from "bun:test";
import { mockPort } from "@packages/test/bun";
import type { INotificationStreamHub } from "../../../application/ports/services/notification-stream-hub.port";
import { MAX_STREAMS_PER_USER } from "../../../application/queries/open-notification-stream.query";
import { HubOpenNotificationStreamQuery } from "../../../infra/queries/open-notification-stream.query";

function given(openStreams: number) {
  const hub = mockPort<INotificationStreamHub>();
  hub.subscriberCount.mockReturnValue(openStreams);
  hub.subscribe.mockReturnValue(() => {});

  return { hub, query: new HubOpenNotificationStreamQuery(hub) };
}

describe("open a notification stream", () => {
  it("opens a stream below the per-user cap and subscribes it to that user's signals", async () => {
    const { hub, query } = given(MAX_STREAMS_PER_USER - 1);

    const result = await query.execute({ userId: "u1" });
    result.getValue().subscribe(() => {});

    expect(hub.subscribe.mock.calls[0]?.[0]).toBe("u1");
  });

  it("refuses a stream once the user holds the cap", async () => {
    const { hub, query } = given(MAX_STREAMS_PER_USER);

    const result = await query.execute({ userId: "u1" });

    expect(result.getError().code).toBe("NOTIFICATION_STREAM_RATE_LIMITED");
    expect(hub.subscribe).not.toHaveBeenCalled();
  });
});
