import { Result } from "@packages/ddd-kit";

export interface SamlConfigError {
  readonly code: "WEAK_SIGNATURE_ALGORITHM";
  readonly message: string;
}

// @better-auth/sso accepts an algorithm as bare ("sha1"), prefixed ("rsa-sha1",
// "ecdsa-sha1") or full xmldsig URI ("http://www.w3.org/2000/09/xmldsig#rsa-sha1",
// "…#sha1") — every accepted spelling of the sha1/md5 families carries the family
// name as a substring, and no accepted strong algorithm (sha256/sha384/sha512 and
// their rsa-/ecdsa-/URI forms) contains "sha1" or "md5" as a substring, so a
// substring match on the family name is sound without enumerating every prefix.
const WEAK_ALGORITHM_FAMILIES = ["sha1", "md5"];

// samlify (via @better-auth/sso) accepts bare short names ("sha256") and normalizes
// them to full xmldsig URIs itself at usage time — forcing the bare form here is
// correct, not a shortcut. Weak algorithms are rejected outright rather than
// silently upgraded: an IdP configured for SHA-1 would fail every assertion after a
// silent upgrade, and the operator would debug the wrong end of the connection.
export function normalizeSamlConfig(
  input: Record<string, unknown>,
): Result<Record<string, unknown>, SamlConfigError> {
  for (const field of ["signatureAlgorithm", "digestAlgorithm"]) {
    const value = input[field];
    if (typeof value === "string") {
      const lowered = value.toLowerCase();
      if (WEAK_ALGORITHM_FAMILIES.some((family) => lowered.includes(family))) {
        return Result.fail({
          code: "WEAK_SIGNATURE_ALGORITHM",
          message: `${field}=${value} is not accepted; use sha256`,
        });
      }
    }
  }

  return Result.ok({
    ...input,
    wantAssertionsSigned: true,
    authnRequestsSigned: true,
    signatureAlgorithm: "sha256",
    digestAlgorithm: "sha256",
  });
}
