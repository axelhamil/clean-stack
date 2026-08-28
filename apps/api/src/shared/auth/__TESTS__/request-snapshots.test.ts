import { describe, expect, it } from "bun:test";
import { RequestSnapshots } from "../request-snapshots";

interface Actor {
  actorUserId: string;
  organizationId: string;
}

const actor: Actor = { actorUserId: "owner-1", organizationId: "org-1" };

describe("RequestSnapshots", () => {
  it("returns the snapshot to the consumer that matches it, once", () => {
    const snapshots = new RequestSnapshots<Actor>(30_000);
    snapshots.set("user-1", actor);

    expect(snapshots.take("user-1", (v) => v.organizationId === "org-1")).toEqual(actor);
    expect(snapshots.take("user-1", (v) => v.organizationId === "org-1")).toBeUndefined();
  });

  it("withholds a snapshot from a consumer it does not match, and keeps it", () => {
    const snapshots = new RequestSnapshots<Actor>(30_000);
    snapshots.set("user-1", actor);

    // The poisoning case: a stranded entry must not attach to an unrelated removal
    // of the same user in another org.
    expect(snapshots.take("user-1", (v) => v.organizationId === "org-2")).toBeUndefined();
    // …and the entry survives for the request that actually took it.
    expect(snapshots.take("user-1", (v) => v.organizationId === "org-1")).toEqual(actor);
  });

  it("never returns a stale snapshot, whatever the consumer accepts", () => {
    const snapshots = new RequestSnapshots<Actor>(-1);
    snapshots.set("user-1", actor);

    expect(snapshots.take("user-1")).toBeUndefined();
  });

  it("drops a stale snapshot on read rather than leaving it to be re-tested", () => {
    const snapshots = new RequestSnapshots<Actor>(-1);
    snapshots.set("user-1", actor);
    snapshots.take("user-1");

    // A zero-TTL store that kept the entry would hand it to the next reader the
    // moment the window was widened; proving removal needs the internal view.
    expect((snapshots as unknown as { entries: Map<string, unknown> }).entries.size).toBe(0);
  });

  it("sweeps stale entries on write so a stranded key cannot accumulate", () => {
    const snapshots = new RequestSnapshots<Actor>(-1);
    snapshots.set("user-1", actor);
    snapshots.set("user-2", actor);

    const internal = (snapshots as unknown as { entries: Map<string, unknown> }).entries;
    expect(internal.has("user-1")).toBe(false);
    expect(internal.size).toBe(1);
  });

  it("takes without a predicate when the key alone identifies the request", () => {
    const snapshots = new RequestSnapshots<string>(30_000);
    snapshots.set("provider-1", "org-1");

    expect(snapshots.take("provider-1")).toBe("org-1");
    expect(snapshots.take("provider-1")).toBeUndefined();
  });
});
