import type { IDomainEvent } from "@packages/ddd-kit";
import type { EmailError } from "@packages/email/email.port";
import type { AdminQueryError } from "../../queries/list-users.query";

export interface NotifyImpersonatedUserInput {
  userId: string;
  reason: string;
  expiresAt: string;
  event: IDomainEvent;
}

export type NotifyImpersonatedUserError = AdminQueryError | EmailError;
