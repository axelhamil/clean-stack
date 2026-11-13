import type { Result } from "@packages/ddd-kit";
import type {
  ImpersonationRefusedError,
  SessionCookies,
} from "../../ports/services/auth-provider.port";

export interface StartImpersonationInput {
  actorUserId: string;
  userId: string;
  reason: string;
  ticketRef?: string;
  ip: string | null;
  expiresAt: string;
  start: () => Promise<Result<SessionCookies, ImpersonationRefusedError>>;
}
