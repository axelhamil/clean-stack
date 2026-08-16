import { Result } from "@packages/ddd-kit";

export interface SamlConfigError {
  readonly code: "WEAK_SIGNATURE_ALGORITHM";
  readonly message: string;
}

const WEAK_ALGORITHMS = ["sha1", "md5"];

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
    if (typeof value === "string" && WEAK_ALGORITHMS.includes(value.toLowerCase())) {
      return Result.fail({
        code: "WEAK_SIGNATURE_ALGORITHM",
        message: `${field}=${value} is not accepted; use sha256`,
      });
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
