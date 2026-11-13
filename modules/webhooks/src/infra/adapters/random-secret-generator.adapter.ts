import { Buffer } from "node:buffer";
import type { ISecretGenerator } from "../../application/ports/services/secret-generator.port";

export const randomSecretGenerator: ISecretGenerator = {
  generate: () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return `whsec_${Buffer.from(bytes).toString("base64url")}`;
  },
};
