import { defineModule } from "inwire";
import type { IAuditTrail } from "../../modules/audit-log/application/ports/audit-trail.port";
import type { IAuditPort } from "../../shared/ports/audit.port";

export interface AuditLogSourcesPrerequisites {
  IAuditPort: IAuditPort;
}

export const auditLogSources = defineModule<AuditLogSourcesPrerequisites>()((b) =>
  b.add("IAuditTrail", (c): IAuditTrail => c.IAuditPort),
);
