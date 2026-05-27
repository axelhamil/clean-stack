import { describe, expect, it, mock } from "bun:test";

// -------------------------------------------------------------------------
// Mutable send stub — controls what Resend.emails.send returns per test
// -------------------------------------------------------------------------
type SendResult = { error: null | { message: string; statusCode?: number } };
let sendStub: () => Promise<SendResult> = async () => ({ error: null });

mock.module("resend", () => ({
  Resend: class {
    emails = { send: async (_payload: unknown) => sendStub() };
  },
}));

const { ResendEmailService } = await import("../services/email.service");
const { NoOpInstrumentation } = await import("../services/noop-instrumentation");

// NOTE: TEMPLATE_IDS est lu au niveau module (objet statique) et ne peut pas être
// overridé via mock.module en boilerplate (tous les IDs sont ""). Le retry loop /
// send stub ne sera jamais atteint tant que les IDs sont vides — seul le dev-fallback
// (branche "transport not configured") est testable ici. Les paths retry/capture/non-retryable
// sont couverts par l'intégration une fois les IDs remplis dans le dashboard Resend.

// -------------------------------------------------------------------------
// Dev-mode fallback — ni API key ni templateId configurés (boilerplate par défaut)
// -------------------------------------------------------------------------
describe("ResendEmailService — dev transport fallback", () => {
  it("retourne ok et log le payload quand RESEND_API_KEY absent (boilerplate défaut)", async () => {
    // resend=null + templateId="" → branche early-ok dev
    sendStub = async () => ({ error: null });
    const service = new ResendEmailService(new NoOpInstrumentation());
    const result = await service.sendTemplate("verify_email", "user@example.com", {
      name: "User",
      verifyUrl: "https://app.example.com/verify?token=t",
    });
    expect(result.isSuccess).toBe(true);
  });

  it("retourne ok pour tout template quand transport non configuré en dev", async () => {
    sendStub = async () => ({ error: null });
    const service = new ResendEmailService(new NoOpInstrumentation());
    const result = await service.sendTemplate("magic_link", "user@example.com", {
      magicUrl: "https://app.example.com/magic?token=t",
    });
    expect(result.isSuccess).toBe(true);
  });
});
