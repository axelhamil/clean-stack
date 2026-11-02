import type { IInstrumentation } from "./ports/instrumentation.port";

export function instrumentedFetch(
  instrumentation: IInstrumentation,
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit & { method: string },
): Promise<Response> {
  return instrumentation.startSpan(
    {
      name: `${init.method} ${url}`,
      op: "http.client",
      attributes: { "http.method": init.method, "http.host": new URL(url).host },
    },
    () => fetchImpl(url, init),
  );
}
