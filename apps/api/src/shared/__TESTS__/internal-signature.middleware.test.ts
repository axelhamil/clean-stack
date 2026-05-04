import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { env } from "../env";
import { buildSignatureHeader, canonicalize, SIGNATURE_HEADER, sign } from "../internal-signature";
import { requireInternalSignature } from "../middleware/internal-signature.middleware";

const KEY = env.INTERNAL_SIGNING_KEY ?? "";

function makeApp() {
  return new Hono().post("/secure", requireInternalSignature, (c) => c.json({ ok: true }));
}

async function makeSignedRequest(
  body: object | undefined,
  options: { tamperBody?: object; staleSeconds?: number } = {},
) {
  const rawBody = body === undefined ? "" : JSON.stringify(body);
  const contentType = body === undefined ? null : "application/json";
  const timestamp = Math.floor(Date.now() / 1000) - (options.staleSeconds ?? 0);

  const message = canonicalize({
    timestamp,
    method: "POST",
    path: "/secure",
    host: "localhost",
    contentType,
    rawBody,
  });

  const headers: Record<string, string> = {
    [SIGNATURE_HEADER]: buildSignatureHeader(timestamp, await sign(message, KEY)),
    host: "localhost",
  };
  if (contentType) headers["Content-Type"] = contentType;

  const sentBody = options.tamperBody ? JSON.stringify(options.tamperBody) : rawBody;
  return { headers, body: sentBody };
}

describe("requireInternalSignature middleware", () => {
  describe("when the signature header is missing", () => {
    it("should reject with 401", async () => {
      const res = await makeApp().request("/secure", {
        method: "POST",
        headers: { host: "localhost" },
      });
      expect(res.status).toBe(401);
    });
  });

  describe("when the signature header is malformed", () => {
    it("should reject with 401", async () => {
      const res = await makeApp().request("/secure", {
        method: "POST",
        headers: {
          [SIGNATURE_HEADER]: "garbage",
          host: "localhost",
        },
      });
      expect(res.status).toBe(401);
    });
  });

  describe("when the timestamp is older than the replay window", () => {
    it("should reject with 401", async () => {
      const { headers, body } = await makeSignedRequest({ ok: true }, { staleSeconds: 60 });
      const res = await makeApp().request("/secure", {
        method: "POST",
        headers,
        body,
      });
      expect(res.status).toBe(401);
    });
  });

  describe("when the body is tampered after signing", () => {
    it("should reject with 401", async () => {
      const { headers, body } = await makeSignedRequest(
        { dryRun: false },
        { tamperBody: { dryRun: true } },
      );
      const res = await makeApp().request("/secure", {
        method: "POST",
        headers,
        body,
      });
      expect(res.status).toBe(401);
    });
  });

  describe("when the signature is valid for the request", () => {
    it("should pass through with 200", async () => {
      const { headers, body } = await makeSignedRequest({ hello: "world" });
      const res = await makeApp().request("/secure", {
        method: "POST",
        headers,
        body,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });
  });
});
