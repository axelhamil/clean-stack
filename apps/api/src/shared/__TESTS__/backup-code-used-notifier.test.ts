import { describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import type { IEmailService } from "../ports/email.port";
import { backupCodeUsedNotifier } from "../services/backup-code-used-notifier";

function makeEmailService() {
  const sendTemplate = mock(async () => Result.ok<void, never>(undefined));
  return { service: { sendTemplate } as unknown as IEmailService, sendTemplate };
}

describe("backupCodeUsedNotifier", () => {
  it("sends the backup_code_used template to the payload email", async () => {
    const { service, sendTemplate } = makeEmailService();
    const handler = backupCodeUsedNotifier({ IEmailService: service });

    await handler.handle({
      eventType: "user.mfa.backup_code_used",
      aggregateId: "u1",
      dateOccurred: new Date(),
      payload: { userId: "u1", email: "axel@example.com" },
    });

    expect(sendTemplate).toHaveBeenCalledTimes(1);
    const call = sendTemplate.mock.calls[0] as unknown as [string, string, { securityUrl: string }];
    expect(call[0]).toBe("backup_code_used");
    expect(call[1]).toBe("axel@example.com");
    expect(call[2].securityUrl).toContain("/settings/account");
  });

  it("skips invalid payloads without sending", async () => {
    const { service, sendTemplate } = makeEmailService();
    const handler = backupCodeUsedNotifier({ IEmailService: service });

    await handler.handle({
      eventType: "user.mfa.backup_code_used",
      aggregateId: "u1",
      dateOccurred: new Date(),
      payload: { wrong: true },
    });

    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("swallows email failures (best-effort, never throws)", async () => {
    const sendTemplate = mock(async () =>
      Result.fail<void, { code: string; message: string }>({
        code: "EMAIL_PROVIDER_FAILURE",
        message: "boom",
      }),
    );
    const handler = backupCodeUsedNotifier({
      IEmailService: { sendTemplate } as unknown as IEmailService,
    });

    await expect(
      handler.handle({
        eventType: "user.mfa.backup_code_used",
        aggregateId: "u1",
        dateOccurred: new Date(),
        payload: { userId: "u1", email: "axel@example.com" },
      }),
    ).resolves.toBeUndefined();
  });
});
