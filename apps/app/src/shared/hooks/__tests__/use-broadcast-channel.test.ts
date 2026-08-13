import { describe, expect, test, vi } from "vitest";
import { createBroadcastChannel } from "../use-broadcast-channel";

describe("createBroadcastChannel", () => {
  test("livre le message aux abonnes", () => {
    const channel = createBroadcastChannel<{ type: string }>("test-livraison");
    const recus: string[] = [];
    channel.subscribe((m) => recus.push(m.type));

    channel.post({ type: "ping" });

    expect(recus).toEqual(["ping"]);
  });

  test("le desabonnement arrete la livraison", () => {
    const channel = createBroadcastChannel<{ type: string }>("test-desabo");
    const handler = vi.fn();
    const unsubscribe = channel.subscribe(handler);

    unsubscribe();
    channel.post({ type: "ping" });

    expect(handler).not.toHaveBeenCalled();
  });

  test("sans BroadcastChannel dans l'environnement, post et subscribe sont inoffensifs", () => {
    const original = globalThis.BroadcastChannel;
    // @ts-expect-error suppression volontaire pour simuler un environnement sans support
    globalThis.BroadcastChannel = undefined;

    const channel = createBroadcastChannel<{ type: string }>("test-absent");
    const unsubscribe = channel.subscribe(() => {});

    expect(() => channel.post({ type: "ping" })).not.toThrow();
    expect(() => unsubscribe()).not.toThrow();

    globalThis.BroadcastChannel = original;
  });
});
