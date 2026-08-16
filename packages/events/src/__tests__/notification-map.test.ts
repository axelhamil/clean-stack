import { describe, expect, test } from "vitest";
import { ALL_EVENT_TYPES } from "../event-types";
import {
  forcedLevelOf,
  isNotifiable,
  NOTIFICATION_MAP,
  notificationConfigOf,
} from "../notification-map";

describe("NOTIFICATION_MAP", () => {
  test("les events d'audit purs ne sont pas notifiables", () => {
    expect(isNotifiable("api_token.used")).toBe(false);
    expect(isNotifiable("security.csp.violation")).toBe(false);
    expect(isNotifiable("webhook.delivery.exhausted")).toBe(false);
  });

  test("toute cle du map est un event connu", () => {
    for (const key of Object.keys(NOTIFICATION_MAP)) {
      expect(ALL_EVENT_TYPES).toContain(key);
    }
  });

  test("les events security sont forced", () => {
    const config = notificationConfigOf("user.password_changed");
    expect(config?.forced).toBe(true);
    expect(config?.category).toBe("security");
  });

  test("billing.payment.failed cible billing:read et non manage", () => {
    const config = notificationConfigOf("billing.payment.failed");
    expect(config?.audience).toEqual({ can: { billing: ["read"] } });
  });

  test("aucun event forced ne cible org:all", () => {
    for (const [type, config] of Object.entries(NOTIFICATION_MAP)) {
      if (!config.forced) continue;
      expect(config.audience, `${type} forced vers toute l'org`).not.toBe("org:all");
    }
  });

  test("forcedLevelOf distingue une categorie entierement forcee d'une categorie mixte", () => {
    expect(forcedLevelOf("security")).toBe("all");
    expect(forcedLevelOf("billing")).toBe("some");
    expect(forcedLevelOf("org")).toBe("none");
    expect(forcedLevelOf("activity")).toBe("none");
  });

  test("un event forced n'est jamais batche par dedupWindow", () => {
    for (const [type, config] of Object.entries(NOTIFICATION_MAP)) {
      if (!config.forced) continue;
      expect(config.dedupWindow, `${type} forced avec une fenetre de dedup`).toBeUndefined();
    }
  });
});
