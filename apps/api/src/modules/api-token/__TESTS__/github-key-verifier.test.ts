import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import { generateToken } from "../../../shared/crypto/api-token";
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
  const rPad = r[0]! >= 0x80 ? new Uint8Array([0, ...r]) : r;
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

const TOKEN_PREFIX = "clean_";

const { raw: KNOWN_RAW } = generateToken(TOKEN_PREFIX);

const RECORD: ApiTokenRecord = {
  id: "tok-1",
  userId: "user-1",
  organizationId: null,
  name: "ci-token",
  scopes: ["read:profile"],
  tokenHmac: "hmac-of-known",
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
const mockRevoke = mock(async () => Result.ok());
const mockEnqueue = mock(async () => {});
const mockSendTemplate = mock(async () => Result.ok());

mock.module("../../../container", () => ({
  di: {
    GithubKeyVerifier: { verify: mockVerify },
    IApiTokenRepository: {
      findByHmac: mockFindByHmac,
      revoke: mockRevoke,
    },
    ITransactionService: {
      run: async (cb: (tx: unknown) => Promise<void>) => cb({}),
    },
    IOutboxRepository: { enqueue: mockEnqueue },
    IEmailService: { sendTemplate: mockSendTemplate },
    IInstrumentation: new NoOpInstrumentation(),
  },
}));

mock.module("../../../auth-queries", () => ({
  findUserById: mock(async () => ({ id: "user-1", email: "user@example.com", name: "Alice" })),
}));

const { apiTokenScanningRoutes } = await import("../scanning.routes");

const app = new Hono()
  .route("/api/token-scanning", apiTokenScanningRoutes)
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
    mockVerify.mockImplementation(async () => true);
    mockFindByHmac.mockImplementation(async (_hmac: string) =>
      Result.ok<Option<ApiTokenRecord>, ApiTokenError>(Option.none()),
    );
    mockRevoke.mockImplementation(async () => Result.ok());
    mockSendTemplate.mockImplementation(async () => Result.ok());
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
    expect(body[0]!.label).toBe("false_positive");
    expect(body[0]!.token_raw).toBe(KNOWN_RAW);
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it("returns false_positive for a token with wrong format", async () => {
    const res = await postScan(makeBody([{ token: "bad-format-token", type: "clean_token" }]));
    const body = (await res.json()) as { label: string }[];
    expect(body[0]!.label).toBe("false_positive");
    expect(mockFindByHmac).not.toHaveBeenCalled();
  });

  it("revokes a known token and returns true_positive", async () => {
    mockFindByHmac.mockImplementation(async (_hmac: string) =>
      Result.ok<Option<ApiTokenRecord>, ApiTokenError>(Option.some(RECORD)),
    );

    const res = await postScan(makeBody([{ token: KNOWN_RAW, type: "clean_token" }]));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { label: string }[];
    expect(body[0]!.label).toBe("true_positive");
    expect(mockRevoke).toHaveBeenCalledWith("tok-1", "leaked", expect.anything());
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
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
    expect(body[0]!.label).toBe("true_positive");
    expect(mockRevoke).not.toHaveBeenCalled();
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  it("handles multiple entries, mixing true and false positives", async () => {
    const { raw: unknownRaw } = generateToken(TOKEN_PREFIX);
    mockFindByHmac.mockImplementation(async (hmac: string) => {
      if (hmac === "hmac-of-known")
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
