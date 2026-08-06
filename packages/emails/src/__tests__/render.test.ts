import { describe, expect, it } from "vitest";
import { EMAIL_TEMPLATE_KEYS, renderTemplate } from "../render";
import type { EmailTemplateKey } from "../templates";

const STUB_VARS = {
  verify_email: { name: "Ada", verifyUrl: "https://x.test/v" },
  reset_password: { name: "Ada", resetUrl: "https://x.test/r" },
  magic_link: { magicUrl: "https://x.test/m" },
  org_invitation: {
    inviterName: "Ada",
    orgName: "Acme",
    role: "member",
    inviteUrl: "https://x.test/i",
  },
  data_export_ready: { name: "Ada", downloadUrl: "https://x.test/d", expiresAt: "2026-09-01" },
  delete_requested: { name: "Ada", cancelUrl: "https://x.test/c", expiresAt: "2026-09-01" },
  delete_cancelled: { name: "Ada" },
  delete_completed: { name: "Ada" },
  change_email: { name: "Ada", newEmail: "new@x.test", confirmUrl: "https://x.test/e" },
  backup_code_used: { securityUrl: "https://x.test/s" },
  impersonation_started: {
    userName: "Ada",
    startedAt: "5 août 2026 à 10:00",
    expiresAt: "5 août 2026 à 18:00",
    reason: "ticket #42",
    supportUrl: "https://example.com/support",
  },
  api_token_leaked: {
    name: "Ada",
    tokenName: "CI token",
    revokedAt: "6 août 2026 à 10:00",
  },
} as const satisfies Record<EmailTemplateKey, unknown>;

describe("renderTemplate", () => {
  it("renders verify_email with a non-empty subject, html and text", async () => {
    const out = await renderTemplate("verify_email", {
      name: "Ada",
      verifyUrl: "https://app.example.com/verify?token=t",
    });
    expect(out.subject.length).toBeGreaterThan(0);
    expect(out.html).toContain("https://app.example.com/verify?token=t");
    expect(out.text).toContain("https://app.example.com/verify?token=t");
  });

  it("renders every catalog key without throwing", async () => {
    for (const key of EMAIL_TEMPLATE_KEYS) {
      const out = await renderTemplate(key, STUB_VARS[key]);
      expect(out.html.length).toBeGreaterThan(0);
      expect(out.text.length).toBeGreaterThan(0);
      expect(out.subject.length).toBeGreaterThan(0);
    }
  });
});
