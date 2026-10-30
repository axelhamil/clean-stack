import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { sessionQueryOptions } from "../../api/queries/session";
import { ensureStaffAccess, ensureStaffPermission } from "../ensure-staff";
import { staffCan, staffOf } from "../staff-access";

const session = (staff: unknown) => ({ user: { id: "u" }, session: { id: "s" }, staff });
const auditor = { role: "auditor", permissions: ["audit.read"], mfaOk: true };

function ctx(data: Parameters<QueryClient["setQueryData"]>[1]) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(sessionQueryOptions.queryKey, data);

  return { context: { queryClient } };
}

describe("staffOf", () => {
  it("reads the access the server resolved", () => {
    expect(staffOf(session(auditor))?.role).toBe("auditor");
  });

  it("is null for a plain session, a signed-out visitor and a malformed payload", () => {
    expect(staffOf(session(null))).toBeNull();
    expect(staffOf(null)).toBeNull();
    expect(staffOf(session({ role: "root", permissions: [], mfaOk: true }))).toBeNull();
  });

  it("ignores the auth role: a session with role admin and no staff stays refused", () => {
    expect(staffOf({ user: { id: "u", role: "admin" }, staff: null })).toBeNull();
  });
});

describe("staffCan", () => {
  it("answers from the permissions, never from the role", () => {
    expect(staffCan(staffOf(session(auditor)), "audit.read")).toBe(true);
    expect(staffCan(staffOf(session(auditor)), "users.moderate")).toBe(false);
  });

  it("refuses while the server reports MFA is missing", () => {
    expect(staffCan(staffOf(session({ ...auditor, mfaOk: false })), "audit.read")).toBe(false);
  });
});

describe("ensureStaffAccess", () => {
  it("lets through staff whose MFA requirement is met, enrolled or not", async () => {
    await expect(ensureStaffAccess(ctx(session(auditor)))).resolves.toBeUndefined();
  });

  it("redirects a plain user", async () => {
    await expect(ensureStaffAccess(ctx(session(null)))).rejects.toBeTruthy();
  });

  it("redirects staff whose MFA requirement is not met", async () => {
    await expect(
      ensureStaffAccess(ctx(session({ ...auditor, mfaOk: false }))),
    ).rejects.toBeTruthy();
  });
});

describe("ensureStaffPermission", () => {
  it("lets through staff holding the permission", async () => {
    await expect(
      ensureStaffPermission("audit.read")(ctx(session(auditor))),
    ).resolves.toBeUndefined();
  });

  it("redirects staff without the permission", async () => {
    await expect(ensureStaffPermission("users.read")(ctx(session(auditor)))).rejects.toBeTruthy();
  });
});
