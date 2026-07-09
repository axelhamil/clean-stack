import type { Result } from "@packages/ddd-kit";

export type DisposableEmailError = { code: "DISPOSABLE_CHECK_FAILURE"; message: string };

export interface IDisposableEmailService {
  isDisposable(email: string): Promise<Result<boolean, DisposableEmailError>>;
}
