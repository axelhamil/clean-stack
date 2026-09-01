import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { Locale } from "@packages/i18n";
import type { IEmailService } from "../ports/email.port";
import type { IProfileStore } from "../ports/profile.port";
import { backupCodeUsedNotifier } from "../services/backup-code-used-notifier";

function makeEmailService() {
  const sendTemplate = mock(async () => Result.ok<void, never>(undefined));
  return { service: { sendTemplate } as unknown as IEmailService, sendTemplate };
}

function makeProfileStore(locale?: Locale): IProfileStore {
  return {
    findLocale: async () =>
      Result.ok(locale ? Option.some(locale) : Option.none<Locale>()) as never,
    findLocaleByEmail: async () => Result.ok(Option.none<Locale>()) as never,
    setLocale: async () => Result.ok() as never,
  };
}

describe("backupCodeUsedNotifier", () => {
  it("sends the backup_code_used template to the payload email", async () => {
    const { service, sendTemplate } = makeEmailService();
    const handler = backupCodeUsedNotifier({
      IEmailService: service,
      IProfileStore: makeProfileStore("fr"),
    });

    await handler.handle({
      eventType: EventTypes.USER_MFA_BACKUP_CODE_USED,
      aggregateId: "u1",
      dateOccurred: new Date(),
      payload: { userId: "u1", email: "axel@example.com" },
    });

    expect(sendTemplate).toHaveBeenCalledTimes(1);
    const call = sendTemplate.mock.calls[0] as unknown as [
      string,
      string,
      { securityUrl: string },
      { locale: Locale },
    ];
    expect(call[0]).toBe("backup_code_used");
    expect(call[1]).toBe("axel@example.com");
    expect(call[2].securityUrl).toContain("/settings/account");
    expect(call[3].locale).toBe("fr");
  });

  it("falls back to the default locale when the user record has none", async () => {
    const { service, sendTemplate } = makeEmailService();
    const handler = backupCodeUsedNotifier({
      IEmailService: service,
      IProfileStore: makeProfileStore(),
    });

    await handler.handle({
      eventType: EventTypes.USER_MFA_BACKUP_CODE_USED,
      aggregateId: "u1",
      dateOccurred: new Date(),
      payload: { userId: "u1", email: "axel@example.com" },
    });

    const call = sendTemplate.mock.calls[0] as unknown as [
      string,
      string,
      unknown,
      { locale: Locale },
    ];
    expect(call[3].locale).toBe("en");
  });

  it("skips invalid payloads without sending", async () => {
    const { service, sendTemplate } = makeEmailService();
    const handler = backupCodeUsedNotifier({
      IEmailService: service,
      IProfileStore: makeProfileStore(),
    });

    await handler.handle({
      eventType: EventTypes.USER_MFA_BACKUP_CODE_USED,
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
      IProfileStore: makeProfileStore(),
    });

    await expect(
      handler.handle({
        eventType: EventTypes.USER_MFA_BACKUP_CODE_USED,
        aggregateId: "u1",
        dateOccurred: new Date(),
        payload: { userId: "u1", email: "axel@example.com" },
      }),
    ).resolves.toBeUndefined();
  });
});
