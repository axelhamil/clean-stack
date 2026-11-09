import { describe, expect, it, mock } from "bun:test";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
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
  const rPad = (r[0] ?? 0) >= 0x80 ? new Uint8Array([0, ...r]) : r;
  const sPad = (s[0] ?? 0) >= 0x80 ? new Uint8Array([0, ...s]) : s;
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
  const verifier = new GithubKeyVerifier(mockInstrumentation());
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
    const verifier = new GithubKeyVerifier(mockInstrumentation());

    const result = await verifier.verify("key-1", "any-sig", "any-body");

    globalThis.fetch = originalFetch;
    expect(result).toBe(false);
  });

  it("reports a failed key fetch to telemetry once", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response("down", { status: 503 }),
    ) as unknown as typeof fetch;
    const instrumentation = mockInstrumentation();
    const capture = instrumentation.capture;
    const verifier = new GithubKeyVerifier(instrumentation);

    const result = await verifier.verify("key-1", "any-sig", "any-body");

    globalThis.fetch = originalFetch;
    expect(result).toBe(false);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("refuses a key payload that is not a list of public keys", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ keys: [] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const verifier = new GithubKeyVerifier(mockInstrumentation());

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
    const verifier = new GithubKeyVerifier(mockInstrumentation());

    await verifier.verify("key-1", sig, body);
    await verifier.verify("key-1", sig, body);

    globalThis.fetch = originalFetch;
    expect(fetchCount).toBe(1);
  });
});
