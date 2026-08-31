import { enCatalog } from "@packages/i18n";
import { describe, expect, it } from "vitest";
import { AUDIT_ACTOR_TYPE_LABEL_KEYS } from "../audit-actor-type-labels";

function resolve(key: string): string | undefined {
  let cur: unknown = (enCatalog as Record<string, unknown>).admin;
  for (const seg of key.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "string" ? cur : undefined;
}

describe("AUDIT_ACTOR_TYPE_LABEL_KEYS", () => {
  // `satisfies Record<AuditActorType, string>` only proves every actor type
  // has AN entry — it does not prove each entry points at the RIGHT one. A
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
    expect(resolve(AUDIT_ACTOR_TYPE_LABEL_KEYS.user)).toBe("User");
    expect(resolve(AUDIT_ACTOR_TYPE_LABEL_KEYS.system)).toBe("System");
    expect(resolve(AUDIT_ACTOR_TYPE_LABEL_KEYS.admin)).toBe("Admin");
  });
});
