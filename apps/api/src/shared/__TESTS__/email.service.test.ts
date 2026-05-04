import { describe, expect, it, mock } from "bun:test";

mock.module("resend", () => ({
  Resend: class {
    emails = { send: async () => ({ error: null }) };
  },
}));

const { ResendEmailService } = await import("../services/email.service");

describe("ResendEmailService (out-of-box contract)", () => {
  it("should fail-fast with EMAIL_TRANSPORT_NOT_CONFIGURED when TEMPLATE_IDS are unfilled (boilerplate default)", async () => {
    const service = new ResendEmailService();
    const result = await service.sendTemplate("verify_email", "user@example.com", {
      name: "User",
      verifyUrl: "https://app.example.com/verify?token=t",
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("EMAIL_TRANSPORT_NOT_CONFIGURED");
  });
});
