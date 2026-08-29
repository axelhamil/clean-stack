import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { Locale } from "@packages/i18n";
import { z } from "zod";
import type { IProfileStore } from "../../modules/profile/application/ports/profile.port";
import type { IEmailService } from "../ports/email.port";

// mock.module leaks across files: drizzle-outbox.service.test.ts stubs EVERY
// @packages/events payload schema with `{ safeParse: () => ({ success: true, data: {} }) }`.
// Loaded after it, this file's handler would accept any payload and read an
// undefined email. Re-mock with the real schema so validation holds whatever
// the file order is — same superset rule as revoke-on-membership-lost.test.ts.
mock.module("@packages/events", () => ({
  EventTypes,
  UserMfaBackupCodeUsedPayload: z.object({ userId: z.string(), email: z.string() }),
}));

const { backupCodeUsedNotifier } = await import("../services/backup-code-used-notifier");

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
      eventType: "user.mfa.backup_code_used",
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
      eventType: "user.mfa.backup_code_used",
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
      IProfileStore: makeProfileStore(),
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
