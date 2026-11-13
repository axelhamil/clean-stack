import { describe, expect, it } from "bun:test";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { staffAccessRules } from "../composition/sources/rgpd";

function rulesWith(listed: string[] = []) {
  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockImplementation(async () => {});

  return { outbox, rules: staffAccessRules(outbox, { PLATFORM_ADMIN_IDS: listed }) };
}

describe("staffAccessRules, the host adapter rgpd receives", () => {
  describe("announceImpersonationsEnded", () => {
    it("announces each ended impersonation as revoked, the impersonator as actor", async () => {
      const { outbox, rules } = rulesWith();
      const createdAt = new Date(Date.now() - 60_000);
      const expiresAt = new Date(createdAt.getTime() + 3_600_000);

      await rules.announceImpersonationsEnded(
        [
          { sessionId: "s1", userId: "u1", impersonatedBy: "staff-1", createdAt, expiresAt },
          { sessionId: "s2", userId: "customer", impersonatedBy: "u1", createdAt, expiresAt },
        ],
        "revoked",
        new Date(),
      );

      expect(
        enqueuedEvents(outbox)
          .filter((e) => e.eventType === EventTypes.ADMIN_IMPERSONATION_STOPPED)
          .map((e) => e.payload),
      ).toEqual([
        expect.objectContaining({ actorUserId: "staff-1", userId: "u1", endReason: "revoked" }),
        expect.objectContaining({ actorUserId: "u1", userId: "customer", endReason: "revoked" }),
      ]);
    });
  });

  describe("isLastManager", () => {
    it("refuses the last manager", () => {
      const { rules } = rulesWith();

      expect(rules.isLastManager("u1", [{ userId: "u1", source: "console" }])).toBe(true);
    });

    it("lets a manager go when another one remains", () => {
      const { rules } = rulesWith();

      expect(
        rules.isLastManager("u1", [
          { userId: "u1", source: "console" },
          { userId: "u2", source: "console" },
        ]),
      ).toBe(false);
    });
  });

  describe("isListed", () => {
    it("treats an env-listed manager as the recovery", () => {
      const { rules } = rulesWith(["u1"]);

      expect(rules.isListed("u1")).toBe(true);
      expect(rules.isListed("u2")).toBe(false);
    });
  });
});
