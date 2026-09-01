import { NOTIFICATION_CATEGORIES } from "@packages/events";
import { createI18n, type Resources } from "@packages/i18n";
import enCatalog from "@packages/i18n/src/catalogs/en";
import frCatalog from "@packages/i18n/src/catalogs/fr";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";
import type { Notification } from "../../api/queries/notifications";
import { groupNotifications } from "../group-notifications";
import { applyRead } from "../notification-broadcast";
import { CATEGORY_KEYS, categoryKeyFor } from "../notification-item";
import { badgeLabel, labelOf, unreadLabel } from "../notification-labels";

function pluralKey(locale: "en" | "fr", count: number): "unreadLabel_one" | "unreadLabel_other" {
  return new Intl.PluralRules(locale).select(count) === "one"
    ? "unreadLabel_one"
    : "unreadLabel_other";
}

function expectedUnreadLabel(catalog: Resources, locale: "en" | "fr", count: number): string {
  if (count === 0) return catalog.common.notifications.unreadNone;
  const key = pluralKey(locale, count);
  return catalog.common.notifications[key].replace("{{count}}", String(count));
}

const makeNotification = (overrides: Partial<Notification> & { id: string }): Notification =>
  ({
    userId: "u1",
    organizationId: null,
    category: "org",
    eventType: "org.member.joined",
    groupKey: null,
    payload: {},
    readAt: null,
    createdAt: "2026-08-16T10:00:00.000Z",
    ...overrides,
  }) as Notification;

const seedList = (client: QueryClient, items: Notification[]) => {
  client.setQueryData(["notifications", "list"], {
    pages: [{ items, nextCursor: null }],
    pageParams: [undefined],
  });
};

describe("groupNotifications", () => {
  test("les lignes partageant un groupKey forment un seul groupe", () => {
    const groups = groupNotifications([
      makeNotification({ id: "a", groupKey: "org-1:joined" }),
      makeNotification({ id: "b", groupKey: "org-1:joined" }),
      makeNotification({ id: "c", groupKey: "org-1:joined" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(3);
    expect(groups[0]?.ids).toEqual(["a", "b", "c"]);
  });

  test("une ligne sans groupKey reste seule meme si elle partage son eventType", () => {
    const groups = groupNotifications([
      makeNotification({ id: "a" }),
      makeNotification({ id: "b" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.count === 1)).toBe(true);
  });

  test("le groupe retient la ligne la plus recente et l'ordre d'arrivee", () => {
    const groups = groupNotifications([
      makeNotification({ id: "recent", groupKey: "k", createdAt: "2026-08-16T12:00:00.000Z" }),
      makeNotification({ id: "vieux", groupKey: "k", createdAt: "2026-08-16T08:00:00.000Z" }),
      makeNotification({ id: "seul", createdAt: "2026-08-16T09:00:00.000Z" }),
    ]);

    expect(groups.map((group) => group.key)).toEqual(["k", "seul"]);
    expect(groups[0]?.latest.id).toBe("recent");
  });

  test("un groupe est non lu des qu'une seule de ses lignes l'est", () => {
    const groups = groupNotifications([
      makeNotification({ id: "a", groupKey: "k", readAt: "2026-08-16T11:00:00.000Z" }),
      makeNotification({ id: "b", groupKey: "k" }),
    ]);

    expect(groups[0]?.unread).toBe(true);
  });
});

describe("labelOf", () => {
  test("un event du catalogue emprunte sa description partagee", () => {
    expect(labelOf(makeNotification({ id: "a", eventType: "org.member.joined" }))).toBe(
      "A member joined an organization.",
    );
  });

  test("un event hors catalogue retombe sur un libelle lisible", () => {
    expect(labelOf(makeNotification({ id: "a", eventType: "order.shipped" }))).toBe(
      "Order shipped",
    );
  });
});

describe("unreadLabel", () => {
  test("annonce le nombre de non-lus aux technologies d'assistance, en anglais", async () => {
    const i18n = await createI18n({ locale: "en", resources: enCatalog });
    const t = i18n.getFixedT("en", "common");

    expect(unreadLabel(t, 0)).toBe(expectedUnreadLabel(enCatalog, "en", 0));
    expect(unreadLabel(t, 1)).toBe(expectedUnreadLabel(enCatalog, "en", 1));
    expect(unreadLabel(t, 12)).toBe(expectedUnreadLabel(enCatalog, "en", 12));
  });

  test("annonce le nombre de non-lus aux technologies d'assistance, en francais", async () => {
    const i18n = await createI18n({ locale: "fr", resources: frCatalog });
    const t = i18n.getFixedT("fr", "common");

    expect(unreadLabel(t, 0)).toBe(expectedUnreadLabel(frCatalog, "fr", 0));
    expect(unreadLabel(t, 1)).toBe(expectedUnreadLabel(frCatalog, "fr", 1));
    expect(unreadLabel(t, 12)).toBe(expectedUnreadLabel(frCatalog, "fr", 12));
  });

  test("zero non-lu garde sa propre formulation, pas un compte a zero", () => {
    // `unreadLabel` special-cases count === 0 onto `unreadNone` rather than
    // letting it fall through to the `_one`/`_other` plural pair — i18next
    // has no `_zero` category either locale's `Intl.PluralRules` selects,
    // but that only forbids the plural mechanism, not the wording. This
    // asserts the actual catalog copy survives: "none unread" in English,
    // "aucune non lue" in French — never "0 unread".
    expect(enCatalog.common.notifications.unreadNone).toBe("Notifications, none unread");
    expect(frCatalog.common.notifications.unreadNone).toBe("Notifications, aucune non lue");
  });

  test("le francais accorde le pluriel differemment de l'anglais des le premier compte", () => {
    // This is why `unreadLabel(t, count)` must never be pinned to a literal
    // for count >= 1 either: French agrees "non lue" (singular) at 1 and
    // "non lues" (plural) from 2 on, while English's "unread" never changes
    // — only the catalog (not a hardcoded string) can tell which applies.
    expect(new Intl.PluralRules("fr").select(1)).toBe("one");
    expect(new Intl.PluralRules("fr").select(2)).toBe("other");
    expect(frCatalog.common.notifications.unreadLabel_one).not.toBe(
      frCatalog.common.notifications.unreadLabel_other,
    );
  });

  test("le badge visuel plafonne l'affichage", () => {
    expect(badgeLabel(9)).toBe("9");
    expect(badgeLabel(10)).toBe("9+");
  });
});

describe("CATEGORY_KEYS", () => {
  test("chaque categorie pointe sur sa propre cle de traduction, jamais sur une autre", () => {
    // `satisfies Record<NotificationCategory, string>` only proves every
    // category is present — it happily accepts `org` mapped to the
    // "security" key. This is the assertion that actually catches a swap.
    expect(CATEGORY_KEYS.security).toBe("notifications.categories.security");
    expect(CATEGORY_KEYS.org).toBe("notifications.categories.org");
    expect(CATEGORY_KEYS.billing).toBe("notifications.categories.billing");
    expect(CATEGORY_KEYS.activity).toBe("notifications.categories.activity");
  });

  test("le mapping couvre exactement les categories connues", () => {
    expect(Object.keys(CATEGORY_KEYS).sort()).toEqual([...NOTIFICATION_CATEGORIES].sort());
  });
});

describe("applyRead", () => {
  test("marque les lignes visees et decremente d'autant le compteur", () => {
    const client = new QueryClient();
    seedList(client, [
      makeNotification({ id: "a" }),
      makeNotification({ id: "b" }),
      makeNotification({ id: "c" }),
    ]);
    client.setQueryData(["notifications", "unread-count"], { count: 3 });

    applyRead(client, { ids: ["a", "b"] }, "2026-08-16T12:00:00.000Z");

    const list = client.getQueryData(["notifications", "list"]) as {
      pages: { items: Notification[] }[];
    };
    expect(list.pages[0]?.items.map((item) => item.readAt)).toEqual([
      "2026-08-16T12:00:00.000Z",
      "2026-08-16T12:00:00.000Z",
      null,
    ]);
    expect(client.getQueryData(["notifications", "unread-count"])).toEqual({ count: 1 });
  });

  test("marque les lignes a travers plusieurs pages chargees via charger plus", () => {
    const client = new QueryClient();
    client.setQueryData(["notifications", "list"], {
      pages: [
        { items: [makeNotification({ id: "a" }), makeNotification({ id: "b" })], nextCursor: "c1" },
        { items: [makeNotification({ id: "c" }), makeNotification({ id: "d" })], nextCursor: null },
      ],
      pageParams: [undefined, "c1"],
    });
    client.setQueryData(["notifications", "unread-count"], { count: 4 });

    applyRead(client, { ids: ["a", "d"] }, "2026-08-16T12:00:00.000Z");

    const list = client.getQueryData(["notifications", "list"]) as {
      pages: { items: Notification[] }[];
    };
    expect(list.pages[0]?.items.map((item) => item.readAt)).toEqual([
      "2026-08-16T12:00:00.000Z",
      null,
    ]);
    expect(list.pages[1]?.items.map((item) => item.readAt)).toEqual([
      null,
      "2026-08-16T12:00:00.000Z",
    ]);
    expect(client.getQueryData(["notifications", "unread-count"])).toEqual({ count: 2 });
  });

  test("marquer deux fois la meme ligne ne decremente qu'une fois", () => {
    const client = new QueryClient();
    seedList(client, [
      makeNotification({ id: "a" }),
      makeNotification({ id: "b" }),
      makeNotification({ id: "c" }),
    ]);
    client.setQueryData(["notifications", "unread-count"], { count: 3 });

    applyRead(client, { ids: ["a"] }, "2026-08-16T12:00:00.000Z");
    applyRead(client, { ids: ["a"] }, "2026-08-16T12:00:01.000Z");

    expect(client.getQueryData(["notifications", "unread-count"])).toEqual({ count: 2 });
  });

  test("tout marquer remet le compteur a zero", () => {
    const client = new QueryClient();
    seedList(client, [makeNotification({ id: "a" }), makeNotification({ id: "b" })]);
    client.setQueryData(["notifications", "unread-count"], { count: 7 });

    applyRead(client, { all: true }, "2026-08-16T12:00:00.000Z");

    expect(client.getQueryData(["notifications", "unread-count"])).toEqual({ count: 0 });
  });

  test("sans liste en cache le compteur suit quand meme le marquage", () => {
    const client = new QueryClient();
    client.setQueryData(["notifications", "unread-count"], { count: 4 });

    applyRead(client, { ids: ["a", "b"] }, "2026-08-16T12:00:00.000Z");

    expect(client.getQueryData(["notifications", "unread-count"])).toEqual({ count: 2 });
  });
});

describe("categoryKeyFor", () => {
  test("resolves every known category to its own key", () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(categoryKeyFor(category)).toBe(CATEGORY_KEYS[category]);
    }
  });

  // The read path has no runtime validation, so this branch is what the user sees
  // if a category ever reaches the client that this build does not know about.
  test("falls back to the unknown key for a category outside the union", () => {
    expect(categoryKeyFor("wat")).toBe("notifications.categories.unknown");
    expect(categoryKeyFor("")).toBe("notifications.categories.unknown");
  });

  test("the fallback key resolves to real copy in both locales", () => {
    expect(enCatalog.common.notifications.categories.unknown).toBeTruthy();
    expect(frCatalog.common.notifications.categories.unknown).toBeTruthy();
  });
});
