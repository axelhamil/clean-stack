import { enCatalog } from "@packages/i18n";
import { describe, expect, it } from "vitest";
import { INVITATION_STATUS_LABEL_KEYS, isInvitationStatus } from "../invitation-status-labels";

function resolve(path: string): string | undefined {
  let cur: unknown = enCatalog.settings;
  for (const seg of path.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "string" ? cur : undefined;
}

describe("INVITATION_STATUS_LABEL_KEYS", () => {
  // Same rationale as ROLE_LABEL_KEYS: `satisfies Record<InvitationStatus, string>`
  // proves every status has AN entry, not that each points at the RIGHT one.
  it("maps each status to its own catalog key, never a swapped one", () => {
    expect(INVITATION_STATUS_LABEL_KEYS).toStrictEqual({
      pending: "organization.invitationStatusPending",
      accepted: "organization.invitationStatusAccepted",
      rejected: "organization.invitationStatusRejected",
      canceled: "organization.invitationStatusCanceled",
    });
  });

  it("every key resolves to the matching English label", () => {
    expect(resolve(INVITATION_STATUS_LABEL_KEYS.pending)).toBe("Pending");
    expect(resolve(INVITATION_STATUS_LABEL_KEYS.accepted)).toBe("Accepted");
    expect(resolve(INVITATION_STATUS_LABEL_KEYS.rejected)).toBe("Rejected");
    expect(resolve(INVITATION_STATUS_LABEL_KEYS.canceled)).toBe("Canceled");
  });
});

describe("isInvitationStatus", () => {
  it("accepts the four known statuses", () => {
    expect(isInvitationStatus("pending")).toBe(true);
    expect(isInvitationStatus("accepted")).toBe(true);
    expect(isInvitationStatus("rejected")).toBe(true);
    expect(isInvitationStatus("canceled")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isInvitationStatus("expired")).toBe(false);
    expect(isInvitationStatus("")).toBe(false);
  });
});
