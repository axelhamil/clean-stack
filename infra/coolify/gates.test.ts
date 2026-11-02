import { describe, expect, it } from "bun:test";
import type { FetchFn } from "./client";
import { checkOk, gateUrls } from "./gates";

function answering(...responses: (() => Response)[]) {
  const urls: string[] = [];
  const fetchFn: FetchFn = async (url) => {
    urls.push(url);
    const next = responses[Math.min(urls.length - 1, responses.length - 1)];

    if (!next) {
      throw new Error("no answer");
    }

    return next();
  };

  return { urls, fetchFn };
}

describe("deploy gates", () => {
  it("checks api readiness and both front health pages", () => {
    expect(
      gateUrls({
        api: "https://api.example.com/",
        app: "https://app.example.com",
        admin: "https://admin.example.com",
      }),
    ).toEqual([
      "https://api.example.com/readyz",
      "https://app.example.com/health",
      "https://admin.example.com/health",
    ]);
  });

  it("retries until the url answers 200", async () => {
    const { urls, fetchFn } = answering(
      () => new Response("", { status: 503 }),
      () => {
        throw new Error("connection refused");
      },
      () => new Response("ok", { status: 200 }),
    );

    await checkOk("https://api.example.com/readyz", { fetchFn, delayMs: 0 });

    expect(urls).toHaveLength(3);
  });

  it("treats a call that never answers as a failed try", async () => {
    let tries = 0;
    const fetchFn: FetchFn = (_url, init) => {
      tries += 1;

      if (tries > 1) {
        return Promise.resolve(new Response("ok", { status: 200 }));
      }

      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    };

    await checkOk("https://api.example.com/readyz", { fetchFn, delayMs: 0, timeoutMs: 10 });

    expect(tries).toBe(2);
  });

  it("fails after five tries without a 200, naming the url and the last answer", async () => {
    const { urls, fetchFn } = answering(() => new Response("", { status: 302 }));

    await expect(
      checkOk("https://app.example.com/health", { fetchFn, delayMs: 0 }),
    ).rejects.toThrow(
      /app\.example\.com\/health did not answer 200 after 5 tries, last answer 302/,
    );
    expect(urls).toHaveLength(5);
  });
});
