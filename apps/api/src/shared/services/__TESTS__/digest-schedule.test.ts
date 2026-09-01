import { describe, expect, test } from "bun:test";
import { DEFAULT_DIGEST_HOUR_UTC, digestDueAt } from "../digest-schedule";

const at = (iso: string) => new Date(iso);
const iso = (d: Date) => d.toISOString();

describe("digestDueAt", () => {
  test("immediate rend l'instant de l'événement, inchangé", () => {
    const occurred = at("2026-03-10T09:15:00.000Z");
    expect(digestDueAt(occurred, "immediate", 8)).toEqual(occurred);
  });

  test("hourly tombe sur la prochaine heure pleine", () => {
    expect(iso(digestDueAt(at("2026-03-10T09:15:00.000Z"), "hourly", 8))).toBe(
      "2026-03-10T10:00:00.000Z",
    );
  });

  test("hourly franchit minuit sans dériver", () => {
    expect(iso(digestDueAt(at("2026-03-10T23:59:59.999Z"), "hourly", 8))).toBe(
      "2026-03-11T00:00:00.000Z",
    );
  });

  test("daily vise l'ancrage du jour quand l'événement le précède", () => {
    expect(iso(digestDueAt(at("2026-03-10T06:30:00.000Z"), "daily", 8))).toBe(
      "2026-03-10T08:00:00.000Z",
    );
  });

  test("daily bascule au lendemain quand l'ancrage est passé", () => {
    expect(iso(digestDueAt(at("2026-03-10T09:15:00.000Z"), "daily", 8))).toBe(
      "2026-03-11T08:00:00.000Z",
    );
  });

  // The boundary is the one case a "24 h after the last send" rule gets wrong in
  // both directions: an event landing exactly on the anchor either doubles up in
  // the digest that is being cut right now, or falls through it entirely.
  test("un événement pile sur l'ancrage part avec le digest suivant", () => {
    expect(iso(digestDueAt(at("2026-03-10T08:00:00.000Z"), "daily", 8))).toBe(
      "2026-03-11T08:00:00.000Z",
    );
    expect(iso(digestDueAt(at("2026-03-10T09:00:00.000Z"), "hourly", 8))).toBe(
      "2026-03-10T10:00:00.000Z",
    );
  });

  test("deux événements de la même fenêtre partagent exactement la même échéance", () => {
    const first = digestDueAt(at("2026-03-10T08:00:01.000Z"), "daily", 8);
    const second = digestDueAt(at("2026-03-10T23:59:00.000Z"), "daily", 8);
    expect(iso(first)).toBe(iso(second));
  });

  test("l'ancrage est configurable et l'ancrage par défaut est 08:00 UTC", () => {
    expect(iso(digestDueAt(at("2026-03-10T09:15:00.000Z"), "daily", 22))).toBe(
      "2026-03-10T22:00:00.000Z",
    );
    expect(iso(digestDueAt(at("2026-03-10T09:15:00.000Z"), "daily"))).toBe(
      iso(digestDueAt(at("2026-03-10T09:15:00.000Z"), "daily", DEFAULT_DIGEST_HOUR_UTC)),
    );
  });

  test("ne mute jamais la date reçue", () => {
    const occurred = at("2026-03-10T09:15:00.000Z");
    digestDueAt(occurred, "daily", 8);
    digestDueAt(occurred, "hourly", 8);
    expect(iso(occurred)).toBe("2026-03-10T09:15:00.000Z");
  });
});
