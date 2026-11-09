import type { IAuditPort } from "./audit.port";

export type IAuditTrail = Pick<IAuditPort, "list" | "verifyChain">;
