import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";

type GitHubPublicKey = {
  key_identifier: string;
  key: string;
  is_current: boolean;
};

// GitHub ECDSA P-256 signatures arrive DER-encoded (ASN.1 SEQUENCE of two INTEGERs),
// but WebCrypto's subtle.verify for ECDSA expects raw IEEE P1363 format: r‖s, each
// exactly 32 bytes for P-256. Without the conversion, every verification fails silently.
// DER layout: 0x30 <seqLen> 0x02 <rLen> <r> 0x02 <sLen> <s>
// DER INTEGERs prepend 0x00 when the high bit is set (positive-sign padding); raw does not.
function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  let offset = 2;
  if (der[1] === 0x81) offset = 3;

  const rLen = der[offset + 1]!;
  const rBytes = der.subarray(offset + 2, offset + 2 + rLen);
  const sOffset = offset + 2 + rLen;
  const sLen = der[sOffset + 1]!;
  const sBytes = der.subarray(sOffset + 2, sOffset + 2 + sLen);

  // Strip any leading 0x00 sign-byte, then left-pad to 32 bytes.
  const r = rBytes.length > 32 ? rBytes.subarray(rBytes.length - 32) : rBytes;
  const s = sBytes.length > 32 ? sBytes.subarray(sBytes.length - 32) : sBytes;

  const raw = new Uint8Array(64);
  raw.set(r, 32 - r.length);
  raw.set(s, 64 - s.length);
  return raw;
}

function pemToSpki(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function importPemKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    pemToSpki(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

export class GithubKeyVerifier {
  private readonly keys = new Map<string, CryptoKey>();
  private inflightFetch: Promise<void> | null = null;

  constructor(private readonly instrumentation: IInstrumentation) {}

  async verify(keyIdentifier: string, signatureB64: string, body: string): Promise<boolean> {
    return this.instrumentation.startSpan({ name: "GithubKeyVerifier > verify" }, async () => {
      const key = await this.resolveKey(keyIdentifier);
      if (!key) return false;

      try {
        const sigBuf = Buffer.from(signatureB64, "base64");
        const der = new Uint8Array(sigBuf.buffer, sigBuf.byteOffset, sigBuf.byteLength);
        const raw = derToRaw(der);
        return await this.instrumentation.startSpan(
          {
            name: "crypto.subtle.verify ECDSA P-256",
            op: "http.client",
          },
          () =>
            crypto.subtle.verify(
              { name: "ECDSA", hash: "SHA-256" },
              key,
              raw,
              new TextEncoder().encode(body),
            ),
        );
      } catch (err) {
        this.instrumentation.capture(err);
        return false;
      }
    });
  }

  private async resolveKey(keyIdentifier: string): Promise<CryptoKey | null> {
    if (this.keys.has(keyIdentifier)) return this.keys.get(keyIdentifier)!;
    await this.refreshKeys();
    return this.keys.get(keyIdentifier) ?? null;
  }

  private async refreshKeys(): Promise<void> {
    if (this.inflightFetch) {
      await this.inflightFetch;
      return;
    }
    this.inflightFetch = this.doFetch().finally(() => {
      this.inflightFetch = null;
    });
    await this.inflightFetch;
  }

  private async doFetch(): Promise<void> {
    const res = await this.instrumentation.startSpan(
      {
        name: "GET https://api.github.com/meta/public_keys/secret_scanning",
        op: "http.client",
      },
      () =>
        fetch("https://api.github.com/meta/public_keys/secret_scanning", {
          headers: { "User-Agent": "clean-stack/secret-scanner" },
        }),
    );

    if (!res.ok) {
      const err = new Error(`GitHub key fetch failed: ${res.status}`);
      this.instrumentation.capture(err);
      throw err;
    }

    const data = (await res.json()) as { public_keys: GitHubPublicKey[] };
    for (const entry of data.public_keys) {
      if (!this.keys.has(entry.key_identifier)) {
        const key = await importPemKey(entry.key);
        this.keys.set(entry.key_identifier, key);
      }
    }
  }
}
