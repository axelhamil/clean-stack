import { describe, expect, it, mock } from "bun:test";
import { deliverPasswordReset, markPasswordResetDelivered } from "../password-reset-delivery";

describe("deliverPasswordReset", () => {
  it("succeeds once the mail hook reached its end", async () => {
    const result = await deliverPasswordReset(async () => markPasswordResetDelivered(), mock());

    expect(result.isSuccess).toBe(true);
  });

  it("fails when the library swallows the mail hook's error and answers normally", async () => {
    const swallowing = async () => {
      await Promise.reject(new Error("mail down")).catch(() => {});

      return { status: true };
    };

    const result = await deliverPasswordReset(swallowing, mock());

    expect(result.getError().code).toBe("ADMIN_PASSWORD_RESET_UNAVAILABLE");
  });

  it("captures a thrown error and fails the same way", async () => {
    const capture = mock();
    const error = new Error("refused");

    const result = await deliverPasswordReset(async () => {
      throw error;
    }, capture);

    expect(result.isFailure).toBe(true);
    expect(capture).toHaveBeenCalledWith(error);
  });

  it("a delivery in another request does not count for this one", async () => {
    const other = deliverPasswordReset(async () => markPasswordResetDelivered(), mock());
    const mine = deliverPasswordReset(async () => {}, mock());

    expect((await other).isSuccess).toBe(true);
    expect((await mine).isFailure).toBe(true);
  });
});
