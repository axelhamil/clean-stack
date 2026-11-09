import { Option } from "@packages/ddd-kit";
import type { ISecretCipher } from "../../application/ports/secret-cipher.port";
import type { MasterKeyProvider } from "../../application/services/webhooks.service";
import { deriveOrgSubKey, encryptSecret, masterKeyFromHex } from "./aead";

export const aeadSecretCipher: ISecretCipher = {
  seal: (plaintext, masterKey, organizationId) =>
    encryptSecret(plaintext, deriveOrgSubKey(masterKey, organizationId)),
};

export function masterKeyProvider(hex: string | undefined): MasterKeyProvider {
  if (!hex) return () => Option.none();
  let loaded = false;
  let cached: Option<Uint8Array> = Option.none();
  return () => {
    if (loaded) return cached;
    cached = Option.some(masterKeyFromHex(hex));
    loaded = true;
    return cached;
  };
}
