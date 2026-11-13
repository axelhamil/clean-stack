export interface ITokenHasher {
  hmac(raw: string, pepper: string): string;
  randomBody(): string;
}
