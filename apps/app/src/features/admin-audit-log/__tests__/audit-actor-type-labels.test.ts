import { describe, expect, it } from "vitest";
import { enLabel } from "../../../shared/i18n/__tests__/catalog-t";
import { AUDIT_ACTOR_TYPE_LABEL_KEYS } from "../audit-actor-type-labels";

describe("AUDIT_ACTOR_TYPE_LABEL_KEYS", () => {
  // `satisfies Record<AuditActorType, string>` only proves every actor type
  // has AN entry, not that each entry points at the RIGHT one. A
  // swapped pair (e.g. `admin` reading `auditLog.actorType.user`) still
  // type-checks, so this asserts the mapping itself, not just its
  // exhaustiveness.
  it("maps each actor type to its own catalog key, never a swapped one", () => {
    expect(AUDIT_ACTOR_TYPE_LABEL_KEYS).toStrictEqual({
      user: "auditLog.actorType.user",
      system: "auditLog.actorType.system",
      admin: "auditLog.actorType.admin",
    });
  });

  it("every key resolves to the matching English label", () => {
    expect(enLabel(AUDIT_ACTOR_TYPE_LABEL_KEYS.user, "admin")).toBe("User");
    expect(enLabel(AUDIT_ACTOR_TYPE_LABEL_KEYS.system, "admin")).toBe("System");
    expect(enLabel(AUDIT_ACTOR_TYPE_LABEL_KEYS.admin, "admin")).toBe("Admin");
  });
});
