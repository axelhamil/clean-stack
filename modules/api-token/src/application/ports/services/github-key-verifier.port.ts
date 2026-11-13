export interface IGithubKeyVerifier {
  verify(keyIdentifier: string, signatureB64: string, body: string): Promise<boolean>;
}
