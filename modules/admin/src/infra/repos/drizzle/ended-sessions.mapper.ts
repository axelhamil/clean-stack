import { authSchema } from "@packages/drizzle";
import type {
  EndedImpersonation,
  EndedSessions,
} from "../../../application/ports/repositories/staff-store.port";

const { session } = authSchema;

export const ENDED_SESSION_COLUMNS = {
  sessionId: session.id,
  userId: session.userId,
  impersonatedBy: session.impersonatedBy,
  createdAt: session.createdAt,
  expiresAt: session.expiresAt,
};

interface EndedSessionRow {
  sessionId: string;
  userId: string;
  impersonatedBy: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export function endedImpersonationsOf(rows: EndedSessionRow[]): EndedImpersonation[] {
  return rows.flatMap(({ impersonatedBy, ...row }) =>
    impersonatedBy === null ? [] : [{ ...row, impersonatedBy }],
  );
}

export function endedSessionsOf(rows: EndedSessionRow[]): EndedSessions {
  return {
    sessions: rows.map(({ sessionId, userId }) => ({ sessionId, userId })),
    impersonations: endedImpersonationsOf(rows),
  };
}
