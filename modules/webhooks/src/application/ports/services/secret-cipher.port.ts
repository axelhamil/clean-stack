import type { Result } from "@packages/ddd-kit";

export interface SecretUnreadable {
  cause: unknown;
}

export interface ISecretCipher {
  seal(plaintext: string, masterKey: Uint8Array, organizationId: string): string;
  open(
    sealed: string,
    masterKey: Uint8Array,
    organizationId: string,
  ): Result<string, SecretUnreadable>;
}
