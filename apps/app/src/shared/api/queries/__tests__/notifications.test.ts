import { describe, expect, test } from "vitest";
import {
  notificationPreferencesQueryOptions,
  notificationsInfiniteQueryOptions,
  orgNotificationPreferencesQueryOptions,
  unreadCountQueryOptions,
} from "../notifications";

describe("cles de query notifications", () => {
  test("la liste et le compteur ont des cles distinctes", () => {
    expect(notificationsInfiniteQueryOptions().queryKey).not.toEqual(
      unreadCountQueryOptions.queryKey,
    );
  });

  test("la liste reste une seule cle stable, quel que soit l'appel", () => {
    // Une infinite query n'a qu'une seule entree de cache pour toutes ses
    // pages — c'est ce qui permet a `applyRead` de patcher toutes les pages
    // deja chargees en un seul `setQueriesData`, et au flux SSE de marquer
    // toute la liste perimee sans savoir combien de curseurs ont ete charges.
    expect(notificationsInfiniteQueryOptions().queryKey).toEqual(
      notificationsInfiniteQueryOptions().queryKey,
    );
  });

  test("le curseur est un pageParam, pas un segment de la cle de liste", () => {
    expect(notificationsInfiniteQueryOptions().initialPageParam).toBeUndefined();
  });

  test("l'absence de nextCursor arrete la pagination", () => {
    const options = notificationsInfiniteQueryOptions();
    expect(
      options.getNextPageParam({ items: [], nextCursor: null }, [], undefined, []),
    ).toBeUndefined();
    expect(
      options.getNextPageParam(
        { items: [], nextCursor: "2026-08-13T10:00:00Z" },
        [],
        undefined,
        [],
      ),
    ).toBe("2026-08-13T10:00:00Z");
  });

  test("toutes les cles partagent le prefixe notifications", () => {
    expect(notificationsInfiniteQueryOptions().queryKey[0]).toBe("notifications");
    expect(unreadCountQueryOptions.queryKey[0]).toBe("notifications");
    expect(notificationPreferencesQueryOptions.queryKey[0]).toBe("notifications");
    expect(orgNotificationPreferencesQueryOptions.queryKey[0]).toBe("notifications");
  });
});
