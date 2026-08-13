import { describe, expect, test } from "bun:test";
import { buildDigests } from "../flush-notification-emails.route";

const row = (userId: string, category: string, id: string) => ({
  id,
  userId,
  category,
  eventType: "billing.payment.failed",
  email: `${userId}@example.com`,
  payload: {},
});

describe("buildDigests", () => {
  test("groupe par utilisateur et par categorie", () => {
    const digests = buildDigests([
      row("u1", "billing", "n1"),
      row("u1", "billing", "n2"),
      row("u1", "org", "n3"),
      row("u2", "billing", "n4"),
    ]);

    expect(digests).toHaveLength(3);
    const billingU1 = digests.find((d) => d.userId === "u1" && d.category === "billing");
    expect(billingU1?.notificationIds).toEqual(["n1", "n2"]);
  });

  test("un lot vide ne produit aucun digest", () => {
    expect(buildDigests([])).toEqual([]);
  });
});
