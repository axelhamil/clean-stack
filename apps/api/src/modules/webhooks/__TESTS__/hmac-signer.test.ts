import { describe, expect, it } from "bun:test";
import { Buffer } from "node:buffer";
import { isStaleTimestamp, signWebhookPayload } from "../infrastructure/services/hmac-signer";

describe("signWebhookPayload", () => {
  it("returns the format t=<ts>,v1=<hex>", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const result = await signWebhookPayload('{"event":"test"}', "secret", ts);
    expect(result).toMatch(/^t=\d+,v1=[0-9a-f]+$/);
  });

  it("is deterministic — same inputs produce same output", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const a = await signWebhookPayload('{"event":"test"}', "secret", ts);
    const b = await signWebhookPayload('{"event":"test"}', "secret", ts);
    expect(a).toBe(b);
  });

  it("changes when rawBody changes", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const a = await signWebhookPayload('{"event":"a"}', "secret", ts);
    const b = await signWebhookPayload('{"event":"b"}', "secret", ts);
    expect(a).not.toBe(b);
  });

  it("changes when secret changes", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const a = await signWebhookPayload('{"event":"test"}', "secret-1", ts);
    const b = await signWebhookPayload('{"event":"test"}', "secret-2", ts);
    expect(a).not.toBe(b);
  });

  it("changes when timestamp changes", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const a = await signWebhookPayload('{"event":"test"}', "secret", ts);
    const b = await signWebhookPayload('{"event":"test"}', "secret", ts + 1);
    expect(a).not.toBe(b);
  });

  it("can be verified via crypto.subtle.verify (round-trip)", async () => {
    const rawBody = '{"event":"verified"}';
    const secret = "round-trip-secret";
    const ts = Math.floor(Date.now() / 1000);

    const header = await signWebhookPayload(rawBody, secret, ts);
    const hexSig = header.split(",v1=")[1] ?? "";
    const sigBytes = new Uint8Array(Buffer.from(hexSig, "hex"));

    const verifyKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const signed = `${ts}.${rawBody}`;
    const valid = await crypto.subtle.verify(
      "HMAC",
      verifyKey,
      sigBytes,
      new TextEncoder().encode(signed),
    );

    expect(valid).toBe(true);
  });
});

describe("isStaleTimestamp", () => {
  it("returns false when timestamp equals now/1000", () => {
    const nowMs = Date.now();
    expect(isStaleTimestamp(Math.floor(nowMs / 1000), nowMs)).toBe(false);
  });

  it("returns true when timestamp is 10 minutes ago (> 5min tolerance)", () => {
    const nowMs = Date.now();
    const ts = Math.floor(nowMs / 1000) - 600; // 10 min ago
    expect(isStaleTimestamp(ts, nowMs)).toBe(true);
  });

  it("returns false when timestamp is 3.3 minutes ago (< 5min tolerance)", () => {
    const nowMs = Date.now();
    const ts = Math.floor(nowMs / 1000) - 200; // 200s ≈ 3.3min
    expect(isStaleTimestamp(ts, nowMs)).toBe(false);
  });

  it("returns true for a timestamp in the future beyond tolerance", () => {
    const nowMs = Date.now();
    const ts = Math.floor(nowMs / 1000) + 600; // 10 min in future
    expect(isStaleTimestamp(ts, nowMs)).toBe(true);
  });
});
