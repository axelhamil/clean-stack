import { hcWithType } from "api/client";
import { env } from "../env";

const baseUrl = env.VITE_API_URL.endsWith("/") ? env.VITE_API_URL : `${env.VITE_API_URL}/`;

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const customFetch: FetchFn = async (input, init) => {
  const headers = new Headers(init?.headers);
  if (!headers.has("X-Request-Id")) {
    headers.set("X-Request-Id", crypto.randomUUID());
  }
  return fetch(input, { ...init, headers });
};

export const api = hcWithType(baseUrl, {
  init: { credentials: "include" },
  fetch: customFetch,
});
