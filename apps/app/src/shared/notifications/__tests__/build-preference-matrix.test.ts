import { describe, expect, test } from "vitest";
import type { NotificationPreference } from "../../api/queries/notifications";
import { buildPreferenceMatrix } from "../build-preference-matrix";

const preference = (over: Partial<NotificationPreference>): NotificationPreference =>
  ({
    scope: "user",
    scopeId: "u1",
    category: "org",
    channel: "in_app",
    enabled: true,
    frequency: "immediate",
    locked: false,
    ...over,
  }) as NotificationPreference;

describe("buildPreferenceMatrix", () => {
  test("rend une ligne par categorie du catalogue, meme sans preference enregistree", () => {
    const rows = buildPreferenceMatrix([]);

    expect(rows.map((row) => row.category)).toEqual(["security", "org", "billing", "activity"]);
  });

  test("une cellule sans preference enregistree vaut actif, immediat, non verrouille", () => {
    const [security] = buildPreferenceMatrix([]);

    expect(security?.in_app).toEqual({
      enabled: true,
      frequency: "immediate",
      locked: false,
      explicit: false,
    });
  });

  test("une preference enregistree ecrase le defaut et se signale comme explicite", () => {
    const rows = buildPreferenceMatrix([
      preference({ category: "billing", channel: "email", enabled: false, frequency: "daily" }),
    ]);
    const billing = rows.find((row) => row.category === "billing");

    expect(billing?.email).toEqual({
      enabled: false,
      frequency: "daily",
      locked: false,
      explicit: true,
    });
    expect(billing?.in_app.explicit).toBe(false);
  });

  test("le verrou d'une preference d'organisation est conserve", () => {
    const rows = buildPreferenceMatrix([
      preference({ scope: "org", category: "org", channel: "in_app", locked: true }),
    ]);

    expect(rows.find((row) => row.category === "org")?.in_app.locked).toBe(true);
  });

  test("une preference d'une autre categorie ne contamine pas les voisines", () => {
    const rows = buildPreferenceMatrix([
      preference({ category: "activity", channel: "in_app", enabled: false }),
    ]);

    expect(rows.find((row) => row.category === "activity")?.in_app.enabled).toBe(false);
    expect(rows.find((row) => row.category === "org")?.in_app.enabled).toBe(true);
  });
});
