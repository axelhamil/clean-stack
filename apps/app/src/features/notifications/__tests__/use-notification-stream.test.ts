import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, test, vi } from "vitest";
import { handleStreamChunk } from "../hooks/use-notification-stream";

const fakeClient = () => {
  const invalidate = vi.fn();
  return { invalidate, client: { invalidateQueries: invalidate } as unknown as QueryClient };
};

describe("handleStreamChunk", () => {
  test("un evenement notification declenche une invalidation", () => {
    const { invalidate, client } = fakeClient();

    handleStreamChunk("event: notification\ndata: 1\n\n", client);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications"] });
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

    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  test("un evenement coupe en deux fragments n'invalide qu'apres son terminateur", () => {
    const { invalidate, client } = fakeClient();

    const rest = handleStreamChunk("event: notif", client);
    expect(invalidate).not.toHaveBeenCalled();

    handleStreamChunk(`${rest}ication\ndata: 1\n\n`, client);
    expect(invalidate).toHaveBeenCalledTimes(1);
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

    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
