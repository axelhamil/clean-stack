import { describe, expect, it } from "bun:test";
import { APIError } from "better-auth/api";
import { ORGANIZATION_SEAT_PAYMENT_REQUIRED, organizationSeatGate } from "../organization-seats";

describe("organizationSeatGate", () => {
  it("refuses with a 402 carrying the seat code when the plan has no seat left", async () => {
    const gate = organizationSeatGate(async () => ({ available: false, maxMembers: 3 }));

    const error = await gate("org-1").catch((err: unknown) => err);

    expect(error).toBeInstanceOf(APIError);
    expect(error).toMatchObject({
      statusCode: 402,
      body: { code: ORGANIZATION_SEAT_PAYMENT_REQUIRED },
    });
  });

  it("lets the member through while a seat is free", async () => {
    const gate = organizationSeatGate(async () => ({ available: true, maxMembers: 3 }));

    await expect(gate("org-1")).resolves.toBeUndefined();
  });
});
