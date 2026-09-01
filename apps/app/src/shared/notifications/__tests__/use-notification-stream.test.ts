import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { consume, handleStreamChunk } from "../use-notification-stream";

const fakeClient = () => {
  const invalidate = vi.fn();
  return { invalidate, client: { invalidateQueries: invalidate } as unknown as QueryClient };
};

/**
 * A controllable `ReadableStream<Uint8Array>` stand-in: `push` resolves the pending
 * `read()` with a frame, `cancel` (spied) resolves it with `done: true` — the same
 * settlement a real stream gives a reader it is told to cancel while a read is in
 * flight, which is what lets a stalled `consume()` return instead of hanging forever.
 */
function makeFakeStream() {
  let resolveRead: ((value: { done: boolean; value?: Uint8Array }) => void) | null = null;
  const cancel = vi.fn(async () => {
    const resolve = resolveRead;
    resolveRead = null;
    resolve?.({ done: true });
  });
  const reader = {
    read: () =>
      new Promise<{ done: boolean; value?: Uint8Array }>((resolve) => {
        resolveRead = resolve;
      }),
    cancel,
  };
  const body = { getReader: () => reader } as unknown as ReadableStream<Uint8Array>;
  const push = (chunk: string) => {
    const resolve = resolveRead;
    resolveRead = null;
    resolve?.({ done: false, value: new TextEncoder().encode(chunk) });
  };
  return { body, cancel, push };
}

describe("handleStreamChunk", () => {
  test("un evenement notification rafraichit le compteur et marque la liste perimee sans la recharger", () => {
    const { invalidate, client } = fakeClient();

    handleStreamChunk("event: notification\ndata: 1\n\n", client);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications", "unread-count"] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["notifications", "list"],
      refetchType: "none",
    });
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  test("un battement de coeur n'invalide rien", () => {
    const { invalidate, client } = fakeClient();

    handleStreamChunk(": ping\n\n", client);
    handleStreamChunk("event: ping\ndata: \n\n", client);

    expect(invalidate).not.toHaveBeenCalled();
  });

  test("plusieurs evenements dans un meme fragment invalident une fois chacun", () => {
    const { invalidate, client } = fakeClient();

    handleStreamChunk("event: notification\ndata: 1\n\nevent: notification\ndata: 1\n\n", client);

    expect(invalidate).toHaveBeenCalledTimes(4);
  });

  test("un evenement coupe en deux fragments n'invalide qu'apres son terminateur", () => {
    const { invalidate, client } = fakeClient();

    const rest = handleStreamChunk("event: notif", client);
    expect(invalidate).not.toHaveBeenCalled();

    handleStreamChunk(`${rest}ication\ndata: 1\n\n`, client);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  test("le fragment residuel est rendu a l'appelant", () => {
    const { client } = fakeClient();

    expect(handleStreamChunk("event: notification\ndata: 1\n\nevent: pi", client)).toBe(
      "event: pi",
    );
    expect(handleStreamChunk("event: notification\ndata: 1\n\n", client)).toBe("");
  });

  test("un terminateur en fin de ligne windows est reconnu", () => {
    const { invalidate, client } = fakeClient();

    handleStreamChunk("event: notification\r\ndata: 1\r\n\r\n", client);

    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});

describe("consume — garde-temps de silence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("un flux muet au-dela du delai de silence annule le lecteur et se termine", async () => {
    const { client } = fakeClient();
    const { body, cancel } = makeFakeStream();

    const done = consume(body, client);

    await vi.advanceTimersByTimeAsync(54_999);
    expect(cancel).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(cancel).toHaveBeenCalledTimes(1);

    await done;
  });

  test("une trame recue — y compris un ping — repousse le delai de silence", async () => {
    const { client } = fakeClient();
    const { body, cancel, push } = makeFakeStream();

    const done = consume(body, client);

    await vi.advanceTimersByTimeAsync(40_000);
    push("event: ping\ndata: \n\n");
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).not.toHaveBeenCalled();

    // Sans le sursis accorde par le ping ci-dessus, ce total (40s + 40s = 80s) aurait
    // largement depasse le delai de silence (55s) depuis le debut du flux.
    await vi.advanceTimersByTimeAsync(40_000);
    expect(cancel).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(15_000);
    expect(cancel).toHaveBeenCalledTimes(1);

    await done;
  });
});
