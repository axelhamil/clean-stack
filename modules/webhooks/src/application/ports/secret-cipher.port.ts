export interface ISecretCipher {
  seal(plaintext: string, masterKey: Uint8Array, organizationId: string): string;
}
