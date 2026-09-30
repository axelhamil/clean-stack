import { describe, expect, it } from "vitest";
import { enLabel } from "../../../shared/i18n/__tests__/catalog-t";
import { INVITATION_STATUS_LABEL_KEYS, isInvitationStatus } from "../invitation-status-labels";

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
    expect(enLabel(INVITATION_STATUS_LABEL_KEYS.pending, "settings")).toBe("Pending");
    expect(enLabel(INVITATION_STATUS_LABEL_KEYS.accepted, "settings")).toBe("Accepted");
    expect(enLabel(INVITATION_STATUS_LABEL_KEYS.rejected, "settings")).toBe("Rejected");
    expect(enLabel(INVITATION_STATUS_LABEL_KEYS.canceled, "settings")).toBe("Canceled");
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
