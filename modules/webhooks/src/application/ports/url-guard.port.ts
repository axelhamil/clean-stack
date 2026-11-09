import type { Result } from "@packages/ddd-kit";

export type SsrfError = {
  code: "WEBHOOK_URL_FORBIDDEN" | "WEBHOOK_HOST_LOOKUP_TIMEOUT";
  message: string;
};

export interface IUrlGuard {
  assertPublic(rawUrl: string): Promise<Result<URL, SsrfError>>;
}
