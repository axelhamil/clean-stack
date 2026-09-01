import { describe, expect, it } from "vitest";
import { groupedSubscribableEvents } from "../forms/event-type-picker";
import { webhookFormSchema } from "../webhooks.schema";

describe("webhookFormSchema", () => {
  it("accepts a valid endpoint with wildcard + exact selectors", () => {
    const r = webhookFormSchema.safeParse({
      url: "https://example.com/hook",
      eventTypes: ["user.*", "org.created"],
      enabled: true,
    });
    expect(r.success).toBe(true);
  });
  it("rejects an empty event list", () => {
    const r = webhookFormSchema.safeParse({ url: "https://a.b", eventTypes: [], enabled: true });
    expect(r.success).toBe(false);
  });
  it("rejects an internal (non-subscribable) event", () => {
    const r = webhookFormSchema.safeParse({
      url: "https://a.b",
      eventTypes: ["webhook.test"],
      enabled: true,
    });
    expect(r.success).toBe(false);
  });
  it("rejects a non-url", () => {
    const r = webhookFormSchema.safeParse({
      url: "not-a-url",
      eventTypes: ["user.*"],
      enabled: true,
    });
    expect(r.success).toBe(false);
  });
});

describe("groupedSubscribableEvents", () => {
  it("has no 'webhook' group because all webhook.* events are internal (C.5 curation decision)", () => {
    const groups = groupedSubscribableEvents();
    const webhook = groups.find((g) => g.group === "webhook");
    expect(webhook).toBeUndefined();
  });
});
