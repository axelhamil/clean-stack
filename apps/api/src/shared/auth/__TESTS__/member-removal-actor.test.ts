import { describe, expect, it } from "bun:test";
import { memberRemovalActor, type ScimDeprovisionActor } from "../member-removal-actor";
import { RequestSnapshots } from "../request-snapshots";

const removal = { removedUserId: "member-1", organizationId: "org-1", sessionUserId: "member-1" };

describe("memberRemovalActor", () => {
  it("names the SCIM connection owner, not the removed user, on a deprovisioning", () => {
    // The auto-collapse of an emptied org used to take `user.id` straight from the
    // plugin: on a SCIM deprovisioning that is the removed member, so the org.deleted
    // audit row named the deprovisioned user as the one who deleted the org.
    const snapshots = new RequestSnapshots<ScimDeprovisionActor>(30_000);
    snapshots.set("member-1", { actorUserId: "owner-1", organizationId: "org-1" });

    expect(memberRemovalActor(snapshots, removal)).toBe("owner-1");
  });

  it("falls back to the session user on an ordinary removal", () => {
    const snapshots = new RequestSnapshots<ScimDeprovisionActor>(30_000);

    expect(memberRemovalActor(snapshots, { ...removal, sessionUserId: "admin-1" })).toBe("admin-1");
  });

  it("ignores a snapshot taken for another organization", () => {
    const snapshots = new RequestSnapshots<ScimDeprovisionActor>(30_000);
    snapshots.set("member-1", { actorUserId: "owner-2", organizationId: "org-2" });

    expect(memberRemovalActor(snapshots, { ...removal, sessionUserId: "admin-1" })).toBe("admin-1");
  });
});
