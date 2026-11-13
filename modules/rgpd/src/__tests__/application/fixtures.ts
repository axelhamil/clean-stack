import { type AppError, Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import type { EmailError, IEmailService } from "@packages/email/email.port";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { mockPort, type PortMock } from "@packages/test/bun";
import type {
  RgpdError,
  UserDeletionState,
} from "../../application/ports/repositories/deletion-state.port";
import { DeletionState } from "../../domain/deletion/value-objects/deletion-state.vo";

export const USER_ID = "u1";
export const NOW = new Date("2026-06-01T12:00:00Z");
export const DAY_MS = 24 * 60 * 60 * 1000;

export const REPO_DOWN: RgpdError = {
  code: "RGPD_REPOSITORY_PROVIDER_FAILURE",
  message: "db down",
};

export const EMAIL_DOWN: EmailError = { code: "EMAIL_PROVIDER_FAILURE", message: "boom" };

export interface DeletionPhase {
  pendingUntil?: Date;
  wipedAt?: Date;
}

export function userState(
  phase: DeletionPhase = {},
  over: Partial<Omit<UserDeletionState, "deletion">> = {},
): UserDeletionState {
  return {
    email: "u@example.com",
    name: "User",
    locale: Option.some("fr"),
    twoFactorEnabled: false,
    deletion: DeletionState.of(
      Option.fromNullable(phase.pendingUntil),
      Option.fromNullable(phase.wipedAt),
    ).getValue(),
    lastExportRequestedAt: Option.none(),
    ...over,
  };
}

export function inTransaction<T, E extends AppError>(seen: unknown[], value: Result<T, E>) {
  return async (): Promise<Result<T, E>> => {
    seen.push(UnitOfWorkContext.transaction());
    return value;
  };
}

export function recordingOutbox(seen: unknown[]): PortMock<IOutboxRepository> {
  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockImplementation(async () => {
    seen.push(UnitOfWorkContext.transaction());
  });

  return outbox;
}

export function recordingEmail(seen: unknown[]): PortMock<IEmailService> {
  const email = mockPort<IEmailService>();
  email.sendTemplate.mockImplementation(async () => {
    seen.push(UnitOfWorkContext.transaction());
    return Result.ok();
  });

  return email;
}

export function sameUnit(seen: unknown[]): boolean {
  const [first] = seen;
  return first !== undefined && seen.every((tx) => tx === first);
}
