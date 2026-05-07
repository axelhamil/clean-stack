import { describe, expect, it } from "bun:test";
import { decryptSecret, deriveOrgSubKey, encryptSecret, masterKeyFromHex } from "../aead";

const VALID_HEX = "0".repeat(64);

describe("masterKeyFromHex", () => {
  it("returns Uint8Array(32) for a valid 64-char hex string", () => {
    const key = masterKeyFromHex(VALID_HEX);
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it("throws with message containing '64 hex chars' for short input", () => {
    expect(() => masterKeyFromHex("toosmall")).toThrow("64 hex chars");
  });

  it("throws for a hex string that is too long", () => {
    expect(() => masterKeyFromHex("0".repeat(66))).toThrow("64 hex chars");
  });
});

describe("deriveOrgSubKey", () => {
  const masterKey = masterKeyFromHex(VALID_HEX);

  it("returns Uint8Array(32)", () => {
    const sub = deriveOrgSubKey(masterKey, "org-1");
    expect(sub).toBeInstanceOf(Uint8Array);
    expect(sub.length).toBe(32);
  });

  it("is deterministic — same org returns same key", () => {
    const a = deriveOrgSubKey(masterKey, "org-1");
    const b = deriveOrgSubKey(masterKey, "org-1");
    expect(Buffer.from(a).toString("hex")).toBe(Buffer.from(b).toString("hex"));
  });

  it("produces different keys for different org IDs", () => {
    const a = deriveOrgSubKey(masterKey, "org-1");
    const b = deriveOrgSubKey(masterKey, "org-2");
    expect(Buffer.from(a).toString("hex")).not.toBe(Buffer.from(b).toString("hex"));
  });
});

describe("encryptSecret + decryptSecret round-trip", () => {
  const masterKey = masterKeyFromHex(VALID_HEX);
  const subKey = deriveOrgSubKey(masterKey, "org-test");

  for (const [label, size] of [
    ["1 char", 1],
    ["100 chars", 100],
    ["1000 chars", 1000],
  ] as const) {
    it(`round-trips plaintext of ${label}`, () => {
      const plaintext = "x".repeat(size);
      const encrypted = encryptSecret(plaintext, subKey);
      const decrypted = decryptSecret(encrypted, subKey);
      expect(decrypted).toBe(plaintext);
    });
  }

  it("round-trips 'hello world'", () => {
    const encrypted = encryptSecret("hello world", subKey);
    const decrypted = decryptSecret(encrypted, subKey);
    expect(decrypted).toBe("hello world");
  });
});

describe("decryptSecret error cases", () => {
  const masterKey = masterKeyFromHex(VALID_HEX);
  const subKey = deriveOrgSubKey(masterKey, "org-test");

  it("throws 'too short' for ciphertext with fewer than 40 bytes", () => {
    // A base64 string that decodes to < 40 bytes
    const shortB64 = Buffer.from(new Uint8Array(10)).toString("base64");
    expect(() => decryptSecret(shortB64, subKey)).toThrow("too short");
  });

  it("throws when decrypting with wrong key (auth tag fails)", () => {
    const encrypted = encryptSecret("secret", subKey);
    const wrongKey = deriveOrgSubKey(masterKey, "org-other");
    expect(() => decryptSecret(encrypted, wrongKey)).toThrow();
  });
});

describe("encryptSecret non-determinism", () => {
  it("produces different ciphertext on each call (random nonce)", () => {
    const masterKey = masterKeyFromHex(VALID_HEX);
    const subKey = deriveOrgSubKey(masterKey, "org-nonce");
    const a = encryptSecret("same plaintext", subKey);
    const b = encryptSecret("same plaintext", subKey);
    expect(a).not.toBe(b);
  });
});
