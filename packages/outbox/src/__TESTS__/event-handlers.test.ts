import { describe, expect, it } from "bun:test";
import { onEvent } from "@packages/ddd-kit";
import { ALL_EVENT_TYPES, EventTypes } from "@packages/events";
import { type BuiltInEventHandler, buildEventDispatcher } from "../event-handlers";

const builtIn = (name: string): BuiltInEventHandler => ({ name, handle: async () => {} });

describe("buildEventDispatcher", () => {
  it("every catalog type reaches the built-ins, a user handler only its own type", () => {
    const dispatcher = buildEventDispatcher(
      [builtIn("audit-log"), builtIn("webhook-fanout"), builtIn("notification-fanout")],
      {
        NotifyImpersonatedUser: onEvent(
          EventTypes.ADMIN_IMPERSONATION_STARTED,
          "notify-impersonated-user",
          () => async () => {},
        )({}),
      },
    );

    const builtInsOnly = ALL_EVENT_TYPES.filter(
      (type) =>
        dispatcher.handlersOf(type).join() === "audit-log,webhook-fanout,notification-fanout",
    );

    expect(builtInsOnly).toHaveLength(ALL_EVENT_TYPES.length - 1);
    expect(dispatcher.handlersOf(EventTypes.ADMIN_IMPERSONATION_STARTED)).toEqual([
      "audit-log",
      "webhook-fanout",
      "notification-fanout",
      "notify-impersonated-user",
    ]);
  });
});
