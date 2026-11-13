export interface IWebhookSigner {
  sign(rawBody: string, secrets: string[], timestampSeconds: number): Promise<string>;
}
