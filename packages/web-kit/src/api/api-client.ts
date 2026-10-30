type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface ApiClientOptions {
  init: RequestInit;
  fetch: FetchFn;
}

const fetchWithRequestId: FetchFn = async (input, init) => {
  const headers = new Headers(init?.headers);
  if (!headers.has("X-Request-Id")) {
    headers.set("X-Request-Id", crypto.randomUUID());
  }
  return fetch(input, { ...init, headers });
};

export function createApiClient<TClient>(
  baseUrl: string,
  createClient: (baseUrl: string, options: ApiClientOptions) => TClient,
): TClient {
  return createClient(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`, {
    init: { credentials: "include" },
    fetch: fetchWithRequestId,
  });
}
