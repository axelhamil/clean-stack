import { describe, expect, test } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import type {
  INotificationStore,
  PreferenceRecord,
  PreferenceScope,
} from "../application/ports/notification.port";
import { NotificationPreferenceService } from "../application/services/notification-preference.service";

function storeWith(preferences: PreferenceRecord[]): INotificationStore {
  return {
    listPreferences: async (scope: PreferenceScope, scopeId: string) =>
      Result.ok(preferences.filter((p) => p.scope === scope && p.scopeId === scopeId)),
  } as unknown as INotificationStore;
}

const pref = (over: Partial<PreferenceRecord>): PreferenceRecord => ({
  scope: "user",
  scopeId: "u1",
  category: "billing",
  channel: "email",
  enabled: true,
  frequency: "immediate",
  locked: false,
  ...over,
});

describe("NotificationPreferenceService.resolve", () => {
  test("sans preference, retombe sur le defaut actif", async () => {
    const service = new NotificationPreferenceService(storeWith([]));
    const result = await service.resolve("u1", Option.none(), "billing", "email");
    expect(result.getValue()).toBe(true);
  });

  test("la preference user prime sur le defaut", async () => {
    const service = new NotificationPreferenceService(storeWith([pref({ enabled: false })]));
    const result = await service.resolve("u1", Option.none(), "billing", "email");
    expect(result.getValue()).toBe(false);
  });

  test("un lock org ecrase la preference user", async () => {
    const service = new NotificationPreferenceService(
      storeWith([
        pref({ enabled: true }),
        pref({ scope: "org", scopeId: "org-1", enabled: false, locked: true }),
      ]),
    );
    const result = await service.resolve("u1", Option.some("org-1"), "billing", "email");
    expect(result.getValue()).toBe(false);
  });

  test("une preference org non verrouillee ne prime pas sur le choix user", async () => {
    const service = new NotificationPreferenceService(
      storeWith([
        pref({ enabled: true }),
        pref({ scope: "org", scopeId: "org-1", enabled: false, locked: false }),
      ]),
    );
    const result = await service.resolve("u1", Option.some("org-1"), "billing", "email");
    expect(result.getValue()).toBe(true);
  });
});
