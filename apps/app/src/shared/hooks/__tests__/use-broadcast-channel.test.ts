import { describe, expect, test, vi } from "vitest";
import { createBroadcastChannel } from "../use-broadcast-channel";

describe("createBroadcastChannel", () => {
  test("livre le message aux abonnes", async () => {
    const publisher = createBroadcastChannel<{ type: string }>("test-livraison");
    const receiver = createBroadcastChannel<{ type: string }>("test-livraison");

    const received = new Promise<string>((resolve, reject) => {
      const guard = setTimeout(
        () => reject(new Error("message non recu dans le delai imparti")),
        500,
      );
      receiver.subscribe((m) => {
        clearTimeout(guard);
        resolve(m.type);
      });
    });

    publisher.post({ type: "ping" });

    await expect(received).resolves.toBe("ping");
  });

  test("le desabonnement arrete la livraison", async () => {
    const publisher = createBroadcastChannel<{ type: string }>("test-desabo");
    const receiver = createBroadcastChannel<{ type: string }>("test-desabo");
    const handler = vi.fn();
    const unsubscribe = receiver.subscribe(handler);

    unsubscribe();
    publisher.post({ type: "ping" });

    await new Promise((r) => setTimeout(r, 100));

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
