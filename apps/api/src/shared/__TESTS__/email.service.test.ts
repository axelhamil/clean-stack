import { describe, expect, it, mock } from "bun:test";

mock.module("resend", () => ({
  Resend: class {
    emails = { send: async () => ({ error: null }) };
  },
}));

const { ResendEmailService } = await import("../services/email.service");

describe("ResendEmailService (out-of-box contract)", () => {
  it("logs payload and returns ok in dev when TEMPLATE_IDS are unfilled (boilerplate default)", async () => {
    const service = new ResendEmailService();
    const result = await service.sendTemplate("verify_email", "user@example.com", {
      name: "User",
      verifyUrl: "https://app.example.com/verify?token=t",
    });
    expect(result.isSuccess).toBe(true);
  });
});
