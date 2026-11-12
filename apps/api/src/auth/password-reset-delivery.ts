import { AsyncLocalStorage } from "node:async_hooks";
import { type AppError, Result } from "@packages/ddd-kit";

export type PasswordResetDeliveryError = AppError<"ADMIN_PASSWORD_RESET_UNAVAILABLE">;

const delivery = new AsyncLocalStorage<{ delivered: boolean }>();

export function markPasswordResetDelivered(): void {
  const store = delivery.getStore();
  if (store) store.delivered = true;
}

export async function deliverPasswordReset(
  request: () => Promise<unknown>,
  capture: (error: unknown) => void,
): Promise<Result<void, PasswordResetDeliveryError>> {
  const store = { delivered: false };
  try {
    await delivery.run(store, request);
  } catch (error) {
    capture(error);
  }
  if (store.delivered) return Result.ok();

  return Result.fail({
    code: "ADMIN_PASSWORD_RESET_UNAVAILABLE",
    message: "The reset email could not be sent. Sessions were ended, try again.",
  });
}
