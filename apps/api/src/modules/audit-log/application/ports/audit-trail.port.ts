import type { IAuditPort } from "../../../../shared/ports/audit.port";

export type IAuditTrail = Pick<IAuditPort, "list" | "verifyChain">;
