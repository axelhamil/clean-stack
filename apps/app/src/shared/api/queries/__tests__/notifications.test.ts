import { describe, expect, test } from "vitest";
import {
  notificationPreferencesQueryOptions,
  notificationsQueryOptions,
  orgNotificationPreferencesQueryOptions,
  unreadCountQueryOptions,
} from "../notifications";

describe("cles de query notifications", () => {
  test("la liste et le compteur ont des cles distinctes", () => {
    expect(notificationsQueryOptions().queryKey).not.toEqual(unreadCountQueryOptions.queryKey);
  });

  test("le curseur fait partie de la cle de liste", () => {
    const sansCurseur = notificationsQueryOptions().queryKey;
    const avecCurseur = notificationsQueryOptions("2026-08-13T10:00:00Z").queryKey;
    expect(avecCurseur).not.toEqual(sansCurseur);
  });

  test("toutes les cles partagent le prefixe notifications", () => {
    expect(notificationsQueryOptions().queryKey[0]).toBe("notifications");
    expect(unreadCountQueryOptions.queryKey[0]).toBe("notifications");
    expect(notificationPreferencesQueryOptions.queryKey[0]).toBe("notifications");
    expect(orgNotificationPreferencesQueryOptions.queryKey[0]).toBe("notifications");
  });
});
