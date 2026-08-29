import { describe, expect, it } from "bun:test";
import { renderTemplate } from "@packages/emails";

describe("renderTemplate locale", () => {
  it("renders the English subject by default", async () => {
    const out = await renderTemplate("verify_email", { name: "Ada", verifyUrl: "https://x" }, "en");
    expect(out.subject).toBe("Confirm your email address");
  });

  it("renders the French subject when asked", async () => {
    const out = await renderTemplate("verify_email", { name: "Ada", verifyUrl: "https://x" }, "fr");
    expect(out.subject).toBe("Confirmez votre adresse e-mail");
    expect(out.html).toContain("Bonjour Ada");
  });

  it("falls back to English for a missing locale", async () => {
    const out = await renderTemplate("verify_email", { name: "Ada", verifyUrl: "https://x" });
    expect(out.subject).toBe("Confirm your email address");
  });

  it("interpolates variables into a localized subject", async () => {
    const out = await renderTemplate(
      "org_invitation",
      { inviterName: "Ada", orgName: "Acme", role: "member", inviteUrl: "https://x" },
      "fr",
    );
    expect(out.subject).toBe("Vous avez été invité à rejoindre Acme");
  });

  it("does not leak one render's locale into the next", async () => {
    const fr = await renderTemplate("verify_email", { name: "A", verifyUrl: "u" }, "fr");
    const en = await renderTemplate("verify_email", { name: "A", verifyUrl: "u" }, "en");
    expect(fr.subject).toBe("Confirmez votre adresse e-mail");
    expect(en.subject).toBe("Confirm your email address");
  });
});
