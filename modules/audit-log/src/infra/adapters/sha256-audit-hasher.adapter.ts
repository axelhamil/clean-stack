import { canonicalize } from "@packages/ddd-kit";
import { CryptoHasher } from "bun";
import type { IAuditHasher } from "../../application/ports/services/audit-hasher.port";

export const sha256AuditHasher: IAuditHasher = {
  hash: (input) => new CryptoHasher("sha256").update(canonicalize(input)).digest("hex"),
};
