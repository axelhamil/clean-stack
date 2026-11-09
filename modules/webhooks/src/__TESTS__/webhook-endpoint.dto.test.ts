import { describe, expect, it } from "bun:test";
import { createEndpointBodySchema } from "../application/dto/create-endpoint.dto";
import { updateEndpointBodySchema } from "../application/dto/update-endpoint.dto";

const BASE_URL = "https://example.com/hook";

describe("createEndpointBodySchema", () => {
  it('accepts wildcard selector ["*"]', () => {
    const result = createEndpointBodySchema.safeParse({
      url: BASE_URL,
      eventTypes: ["*"],
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts group wildcard selector ["user.*"]', () => {
    const result = createEndpointBodySchema.safeParse({
      url: BASE_URL,
      eventTypes: ["user.*"],
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts specific subscribable event ["user.created"]', () => {
    const result = createEndpointBodySchema.safeParse({
      url: BASE_URL,
      eventTypes: ["user.created"],
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects internal event ["webhook.test"]', () => {
    const result = createEndpointBodySchema.safeParse({
      url: BASE_URL,
      eventTypes: ["webhook.test"],
      enabled: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown event type ["bogus.created"]', () => {
    const result = createEndpointBodySchema.safeParse({
      url: BASE_URL,
      eventTypes: ["bogus.created"],
      enabled: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateEndpointBodySchema", () => {
  it('accepts wildcard selector ["*"]', () => {
    const result = updateEndpointBodySchema.safeParse({ eventTypes: ["*"] });
    expect(result.success).toBe(true);
  });

  it('accepts group wildcard selector ["user.*"]', () => {
    const result = updateEndpointBodySchema.safeParse({ eventTypes: ["user.*"] });
    expect(result.success).toBe(true);
  });

  it('rejects internal event ["webhook.test"]', () => {
    const result = updateEndpointBodySchema.safeParse({ eventTypes: ["webhook.test"] });
    expect(result.success).toBe(false);
  });

  it('rejects unknown event type ["bogus.created"]', () => {
    const result = updateEndpointBodySchema.safeParse({ eventTypes: ["bogus.created"] });
    expect(result.success).toBe(false);
  });
});
