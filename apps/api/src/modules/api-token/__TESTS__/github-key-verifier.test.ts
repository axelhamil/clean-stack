import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import { generateToken, hmacToken } from "../../../shared/crypto/api-token";
import { createErrorHandler } from "../../../shared/middleware/error.middleware";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type { ApiTokenError, ApiTokenRecord } from "../application/ports/api-token.port";
import { GithubKeyVerifier } from "../infrastructure/services/github-key-verifier";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function generateKeyPair() {
  return crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
}

async function exportPublicKeyAsPem(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey("spki", key);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(spki)));
  return `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----\n`;
}

// Converts raw IEEE P1363 (r‖s) to DER-encoded signature, matching what GitHub sends.
function rawToDer(raw: Uint8Array): Uint8Array {
  const r = raw.subarray(0, 32);
  const s = raw.subarray(32);
  // biome-ignore lint/style/noNonNullAssertion: r/s are 32-byte fixed-length slices
  const rPad = r[0]! >= 0x80 ? new Uint8Array([0, ...r]) : r;
  // biome-ignore lint/style/noNonNullAssertion: r/s are 32-byte fixed-length slices
  const sPad = s[0]! >= 0x80 ? new Uint8Array([0, ...s]) : s;
  const seqLen = 2 + rPad.length + 2 + sPad.length;
  const der = new Uint8Array(2 + seqLen);
  let i = 0;
  der[i++] = 0x30;
  der[i++] = seqLen;
  der[i++] = 0x02;
  der[i++] = rPad.length;
  der.set(rPad, i);
  i += rPad.length;
  der[i++] = 0x02;
  der[i++] = sPad.length;
  der.set(sPad, i);
  return der;
}

async function signBody(privateKey: CryptoKey, body: string): Promise<string> {
  const rawSig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(body),
  );
  return Buffer.from(rawToDer(new Uint8Array(rawSig))).toString("base64");
}

function makeVerifierWithKey(keyId: string, pem: string): GithubKeyVerifier {
  const verifier = new GithubKeyVerifier(new NoOpInstrumentation());
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock(async () => {
    globalThis.fetch = originalFetch;
    return new Response(
      JSON.stringify({ public_keys: [{ key_identifier: keyId, key: pem, is_current: true }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
  return verifier;
}

// ── GithubKeyVerifier crypto tests ───────────────────────────────────────────

describe("GithubKeyVerifier", () => {
  it("accepts a valid DER-encoded ECDSA P-256 signature", async () => {
    const pair = await generateKeyPair();
    const pem = await exportPublicKeyAsPem(pair.publicKey);
    const body = JSON.stringify([{ token: "test-token", type: "test_type" }]);
    const sig = await signBody(pair.privateKey, body);
    const verifier = makeVerifierWithKey("key-1", pem);

    const result = await verifier.verify("key-1", sig, body);
    expect(result).toBe(true);
  });

  it("rejects a signature from a different key pair", async () => {
    const pair1 = await generateKeyPair();
    const pair2 = await generateKeyPair();
    const pem1 = await exportPublicKeyAsPem(pair1.publicKey);
    const body = JSON.stringify([{ token: "test-token", type: "test_type" }]);
    const sigFromPair2 = await signBody(pair2.privateKey, body);
    const verifier = makeVerifierWithKey("key-1", pem1);

    const result = await verifier.verify("key-1", sigFromPair2, body);
    expect(result).toBe(false);
  });

  it("rejects a signature when the body is altered after signing", async () => {
    const pair = await generateKeyPair();
    const pem = await exportPublicKeyAsPem(pair.publicKey);
    const body = JSON.stringify([{ token: "test-token", type: "test_type" }]);
    const sig = await signBody(pair.privateKey, body);
    const alteredBody = body.replace("test-token", "other-token");
    const verifier = makeVerifierWithKey("key-1", pem);

    const result = await verifier.verify("key-1", sig, alteredBody);
    expect(result).toBe(false);
  });

  it("returns false for an unknown key identifier", async () => {
    const pair = await generateKeyPair();
    const pem = await exportPublicKeyAsPem(pair.publicKey);
    const body = "body";
    const sig = await signBody(pair.privateKey, body);
    const verifier = makeVerifierWithKey("key-known", pem);

    const result = await verifier.verify("key-unknown", sig, body);
    expect(result).toBe(false);
  });

  it("returns false (not throws) when the GitHub key endpoint is unreachable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error("network failure");
    }) as unknown as typeof fetch;
    const verifier = new GithubKeyVerifier(new NoOpInstrumentation());

    const result = await verifier.verify("key-1", "any-sig", "any-body");

    globalThis.fetch = originalFetch;
    expect(result).toBe(false);
  });

  it("caches keys and does not re-fetch on subsequent verifications", async () => {
    const pair = await generateKeyPair();
    const pem = await exportPublicKeyAsPem(pair.publicKey);
    const body = "hello";
    const sig = await signBody(pair.privateKey, body);
    let fetchCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      fetchCount++;
      return new Response(
        JSON.stringify({ public_keys: [{ key_identifier: "key-1", key: pem, is_current: true }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const verifier = new GithubKeyVerifier(new NoOpInstrumentation());

    await verifier.verify("key-1", sig, body);
    await verifier.verify("key-1", sig, body);

    globalThis.fetch = originalFetch;
    expect(fetchCount).toBe(1);
  });
});

// ── scanning.routes.ts endpoint tests ────────────────────────────────────────
// Uses factory injection — no mock.module for container or auth-queries,
// so no global state pollution across the test suite.

const TOKEN_PREFIX = "clean_";
const TOKEN_PEPPER = "a".repeat(32);

const { raw: KNOWN_RAW } = generateToken(TOKEN_PREFIX);
const KNOWN_HMAC = hmacToken(KNOWN_RAW, TOKEN_PEPPER);

const RECORD: ApiTokenRecord = {
  id: "tok-1",
  userId: "user-1",
  organizationId: null,
  name: "ci-token",
  scopes: ["read:profile"],
  tokenHmac: KNOWN_HMAC,
  pepperVersion: 1,
  tokenStart: KNOWN_RAW.slice(0, 14),
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  revokedReason: null,
  createdAt: new Date("2024-01-01"),
};

const mockVerify = mock(async () => true);
const mockFindByHmac = mock(async (_hmac: string) =>
  Result.ok<Option<ApiTokenRecord>, ApiTokenError>(Option.none()),
);
const mockRevoke = mock(async () => Result.ok<ApiTokenError>());
const mockEnqueue = mock(async () => {});
const mockSendTemplate = mock(async () => Result.ok());
const mockFindUserById = mock(async () => ({
  id: "user-1",
  email: "user@example.com",
  name: "Alice",
}));

const { createApiTokenScanningRoutes } = await import("../scanning.routes");

const app = new Hono()
  .route(
    "/api/token-scanning",
    createApiTokenScanningRoutes({
      githubKeyVerifier: { verify: mockVerify },
      apiTokenRepository: { findByHmac: mockFindByHmac, revoke: mockRevoke },
      transactionService: { run: async (cb) => cb({} as never) },
      outboxRepository: { enqueue: mockEnqueue } as never,
      emailService: { sendTemplate: mockSendTemplate },
      instrumentation: new NoOpInstrumentation(),
      findUserById: mockFindUserById,
      prefix: TOKEN_PREFIX,
      pepper: TOKEN_PEPPER,
    }),
  )
  .onError(createErrorHandler(new NoOpInstrumentation()));

function makeBody(entries: { token: string; type: string }[]) {
  return JSON.stringify(entries);
}

async function postScan(body: string, headers: Record<string, string> = {}): Promise<Response> {
  return app.request("/api/token-scanning/github", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "GITHUB-PUBLIC-KEY-IDENTIFIER": "key-1",
      "GITHUB-PUBLIC-KEY-SIGNATURE": "valid-sig",
      ...headers,
    },
    body,
  });
}

describe("POST /api/token-scanning/github", () => {
  beforeEach(() => {
    mockVerify.mockReset();
    mockFindByHmac.mockReset();
    mockRevoke.mockReset();
    mockEnqueue.mockReset();
    mockSendTemplate.mockReset();
    mockFindUserById.mockReset();
    mockVerify.mockImplementation(async () => true);
    mockFindByHmac.mockImplementation(async (_hmac: string) =>
      Result.ok<Option<ApiTokenRecord>, ApiTokenError>(Option.none()),
    );
    mockRevoke.mockImplementation(async () => Result.ok());
    mockSendTemplate.mockImplementation(async () => Result.ok());
    mockFindUserById.mockImplementation(async () => ({
      id: "user-1",
      email: "user@example.com",
      name: "Alice",
    }));
  });

  it("returns 403 when signature headers are missing", async () => {
    const res = await app.request("/api/token-scanning/github", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "[]",
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 when the signature is invalid", async () => {
    mockVerify.mockImplementation(async () => false);
    const res = await postScan(makeBody([{ token: KNOWN_RAW, type: "clean_token" }]));
    expect(res.status).toBe(403);
    expect(mockFindByHmac).not.toHaveBeenCalled();
  });

  it("returns false_positive for a token not in the database", async () => {
    const res = await postScan(makeBody([{ token: KNOWN_RAW, type: "clean_token" }]));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token_raw: string; token_type: string; label: string }[];
    expect(body).toHaveLength(1);
    expect(body[0]?.label).toBe("false_positive");
    expect(body[0]?.token_raw).toBe(KNOWN_RAW);
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it("returns false_positive for a token with wrong format", async () => {
    const res = await postScan(makeBody([{ token: "bad-format-token", type: "clean_token" }]));
    const body = (await res.json()) as { label: string }[];
    expect(body[0]?.label).toBe("false_positive");
    expect(mockFindByHmac).not.toHaveBeenCalled();
  });

  it("revokes a known token and returns true_positive", async () => {
    mockFindByHmac.mockImplementation(async (_hmac: string) =>
      Result.ok<Option<ApiTokenRecord>, ApiTokenError>(Option.some(RECORD)),
    );

    const res = await postScan(makeBody([{ token: KNOWN_RAW, type: "clean_token" }]));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { label: string }[];
    expect(body[0]?.label).toBe("true_positive");
    expect(mockRevoke).toHaveBeenCalledWith("tok-1", "leaked", expect.anything());
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    // biome-ignore lint/style/noNonNullAssertion: guarded by toHaveBeenCalledTimes(1) above
    const [events] = (mockEnqueue as ReturnType<typeof mock>).mock.calls[0]!;
    const event = events[0];
    expect(event.eventType).toBe("api_token.revoked");
    expect(event.payload.reason).toBe("leaked");
    expect(event.payload.actorUserId).toBeNull();
    expect(mockSendTemplate).toHaveBeenCalledWith(
      "api_token_leaked",
      "user@example.com",
      expect.objectContaining({ tokenName: "ci-token" }),
    );
  });

  it("returns true_positive and skips revoke for an already-revoked token", async () => {
    const revoked: ApiTokenRecord = {
      ...RECORD,
      revokedAt: new Date("2024-06-01"),
      revokedReason: "user",
    };
    mockFindByHmac.mockImplementation(async (_hmac: string) =>
      Result.ok<Option<ApiTokenRecord>, ApiTokenError>(Option.some(revoked)),
    );

    const res = await postScan(makeBody([{ token: KNOWN_RAW, type: "clean_token" }]));
    const body = (await res.json()) as { label: string }[];
    expect(body[0]?.label).toBe("true_positive");
    expect(mockRevoke).not.toHaveBeenCalled();
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  it("handles multiple entries, mixing true and false positives", async () => {
    const { raw: unknownRaw } = generateToken(TOKEN_PREFIX);
    mockFindByHmac.mockImplementation(async (hmac: string) => {
      if (hmac === KNOWN_HMAC)
        return Result.ok<Option<ApiTokenRecord>, ApiTokenError>(Option.some(RECORD));
      return Result.ok<Option<ApiTokenRecord>, ApiTokenError>(Option.none());
    });

    const res = await postScan(
      makeBody([
        { token: KNOWN_RAW, type: "clean_token" },
        { token: unknownRaw, type: "clean_token" },
      ]),
    );
    const body = (await res.json()) as { label: string }[];
    expect(body).toHaveLength(2);
  });
});
