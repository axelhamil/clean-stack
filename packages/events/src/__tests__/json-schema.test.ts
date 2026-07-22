import { describe, expect, it } from "vitest";
import { ALL_EVENT_TYPES } from "../event-types";
import { jsonSchemaForEvent } from "../json-schema";

describe("jsonSchemaForEvent", () => {
  it("produces an object schema for every event type without throwing", () => {
    for (const type of ALL_EVENT_TYPES) {
      const schema = jsonSchemaForEvent(type);
      expect(schema, type).toBeTypeOf("object");
      expect(schema.type, type).toBe("object");
      expect(schema.properties, type).toBeTypeOf("object");
    }
  });
});
