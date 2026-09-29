import type { OrgRole } from "../../shared/auth/role-labels";

// Order of every role picker in this feature, least to most privileged: the
// invite form and the member row list the same roles in the same order.
export const ASSIGNABLE_ROLES = ["member", "admin", "owner"] as const satisfies readonly OrgRole[];
