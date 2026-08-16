import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";
import type { Notification } from "../../api/queries/notifications";
import { groupNotifications } from "../group-notifications";
import { applyRead } from "../notification-broadcast";
import { badgeLabel, labelOf, unreadLabel } from "../notification-labels";

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
  client.setQueryData(["notifications", "list", null], { items, nextCursor: null });
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
  test("annonce le nombre de non-lus aux technologies d'assistance", () => {
    expect(unreadLabel(0)).toBe("Notifications, none unread");
    expect(unreadLabel(1)).toBe("Notifications, 1 unread");
    expect(unreadLabel(12)).toBe("Notifications, 12 unread");
  });

  test("le badge visuel plafonne l'affichage", () => {
    expect(badgeLabel(9)).toBe("9");
    expect(badgeLabel(10)).toBe("9+");
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

    const list = client.getQueryData(["notifications", "list", null]) as { items: Notification[] };
    expect(list.items.map((item) => item.readAt)).toEqual([
      "2026-08-16T12:00:00.000Z",
      "2026-08-16T12:00:00.000Z",
      null,
    ]);
    expect(client.getQueryData(["notifications", "unread-count"])).toEqual({ count: 1 });
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
