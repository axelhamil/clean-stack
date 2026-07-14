import { z } from "zod";
import type { EventType } from "./event-types";
import { PayloadByEventType } from "./payloads";

export function jsonSchemaForEvent(eventType: EventType): Record<string, unknown> {
  return z.toJSONSchema(PayloadByEventType[eventType], {
    unrepresentable: "any",
  }) as Record<string, unknown>;
}
