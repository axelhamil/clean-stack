import type { EndedImpersonation } from "./staff-store.port";

export interface EndedSessionRow {
  sessionId: string;
  userId: string;
  impersonatedBy: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface IEndedSessionsReader {
  impersonationsOf(rows: EndedSessionRow[]): EndedImpersonation[];
}
