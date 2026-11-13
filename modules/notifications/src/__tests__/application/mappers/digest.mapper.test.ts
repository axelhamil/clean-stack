import { describe, expect, test } from "bun:test";
import { Option } from "@packages/ddd-kit";
import { buildDigests, digestIdempotencyKey } from "../../../application/mappers/digest.mapper";

const row = (userId: string, category: string, id: string) => ({
  id,
  userId,
  category,
  eventType: "billing.payment.failed",
  email: `${userId}@example.com`,
  locale: Option.none<string>(),
  payload: {},
});

describe("digestIdempotencyKey", () => {
  test("produces a fixed-length key whatever the number of ids", async () => {
    const key2 = await digestIdempotencyKey(["n1", "n2"]);
    const key500 = await digestIdempotencyKey(Array.from({ length: 500 }, (_, i) => `n${i}`));

    expect(key2).toHaveLength(64);
    expect(key500).toHaveLength(64);
  });

  test("does not depend on the order the rows were claimed in", async () => {
    expect(await digestIdempotencyKey(["n2", "n1"])).toBe(await digestIdempotencyKey(["n1", "n2"]));
  });
});

describe("buildDigests", () => {
  test("groups by user and by category", () => {
    const digests = buildDigests([
      row("u1", "billing", "n1"),
      row("u1", "billing", "n2"),
      row("u1", "org", "n3"),
      row("u2", "billing", "n4"),
    ]);

    expect(digests.map((d) => [d.userId, d.category, d.notificationIds])).toEqual([
      ["u1", "billing", ["n1", "n2"]],
      ["u1", "org", ["n3"]],
      ["u2", "billing", ["n4"]],
    ]);
  });
});
